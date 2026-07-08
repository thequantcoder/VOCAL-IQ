import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEncryptor } from '../crypto/envelope';
import { PrismaService } from '../db/prisma.service';
import { BiometricsService, deterministicVoiceprintProvider } from './biometrics.service';

/**
 * Voice biometrics (Day 91) — real Postgres, RLS-scoped. Proves the default-deny governance (off +
 * region-deny), explicit-consent enrollment, encryption at rest (raw voiceprint never stored), the
 * anti-spoof liveness gate + step-up fallback, GDPR erase, the audit trail, and tenant isolation. Uses
 * the deterministic local provider so enroll/verify are reproducible without a vendor.
 */

const db = new PrismaService();
const encryptor = buildEncryptor(process.env);
const svc = new BiometricsService(db, encryptor, deterministicVoiceprintProvider());

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T1 = '00000000-0000-0000-0000-0000091a0001';
const T2 = '00000000-0000-0000-0000-0000091a0002';
const ALICE = 'contact-alice';
const BOB = 'contact-bob';

beforeAll(async () => {
  for (const id of [T1, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Bio ${id.slice(-4)}`,
        slug: `bio-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
});

afterAll(async () => {
  await db.admin.voiceprintAudit.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.voiceprint.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T1, T2] } } });
});

describe('Default-deny governance (self-audit C)', () => {
  it('is disabled by default — enrollment is refused until enabled', async () => {
    expect((await svc.getSettings(T1)).enabled).toBe(false);
    await expect(
      svc.enroll(T1, { contactId: ALICE, region: 'US-NY', consent: true, sample: 'alice-voice' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('denies a region that is not on the explicit allowlist', async () => {
    await svc.setSettings(T1, {
      enabled: true,
      allowedRegions: ['US-NY'],
      threshold: 0.75,
      minLiveness: 0.5,
      retentionDays: 365,
    });
    await expect(
      svc.enroll(T1, { contactId: ALICE, region: 'EU', consent: true, sample: 'alice-voice' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('requires explicit biometric consent', async () => {
    await expect(
      svc.enroll(T1, { contactId: ALICE, region: 'US-NY', consent: false, sample: 'alice-voice' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('rejects a non-live (spoofed) enrollment sample', async () => {
    await expect(
      svc.enroll(T1, { contactId: ALICE, region: 'US-NY', consent: true, sample: 'spoof:eve' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });
});

describe('Enroll + verify + encryption at rest', () => {
  it('enrolls a consented voiceprint and never returns or stores it raw (self-audit C)', async () => {
    const view = await svc.enroll(T1, {
      contactId: ALICE,
      region: 'us-ny',
      consent: true,
      sample: 'alice-voice',
    });
    expect(view.dims).toBe(64);
    expect(view.region).toBe('US-NY'); // normalized
    expect(view).not.toHaveProperty('vector'); // raw embedding never returned

    // At rest the vector is ENCRYPTED — the plaintext embedding is not recoverable from the bytes.
    const row = await db.admin.voiceprint.findFirstOrThrow({
      where: { tenantId: T1, contactId: ALICE },
      select: { vector: true },
    });
    // The stored bytes are ciphertext — not the plaintext embedding JSON (parsing them fails).
    expect(() => JSON.parse(Buffer.from(row.vector).toString('utf8'))).toThrow();
    // Only the envelope key can recover it, and it round-trips to the 64-dim vector.
    const decrypted = JSON.parse(encryptor.decrypt(row.vector)) as number[];
    expect(decrypted).toHaveLength(64);
  });

  it('verifies the same live speaker (outcome verified)', async () => {
    const d = await svc.verify(T1, { contactId: ALICE, region: 'US-NY', sample: 'alice-voice' });
    expect(d.outcome).toBe('verified');
    expect(d.verified).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(0.75);
  });

  it('flags a matching voiceprint with LOW liveness as a spoof — never a pass (self-audit C)', async () => {
    // Same seed as the enrolled sample (so the voiceprint MATCHES) but replayed → low liveness.
    const d = await svc.verify(T1, {
      contactId: ALICE,
      region: 'US-NY',
      sample: 'spoof:alice-voice',
    });
    expect(d.outcome).toBe('spoof');
    expect(d.verified).toBe(false);
    expect(d.needsStepUp).toBe(true);
  });

  it('falls back to step-up for a different (live) speaker', async () => {
    const d = await svc.verify(T1, { contactId: ALICE, region: 'US-NY', sample: 'bob-different' });
    expect(d.verified).toBe(false);
    expect(d.outcome).toBe('step_up');
  });
});

describe('Erase (GDPR) + audit trail', () => {
  it('erases the voiceprint and audits every action', async () => {
    await svc.enroll(T1, { contactId: BOB, region: 'US-NY', consent: true, sample: 'bob-voice' });
    const erased = await svc.erase(T1, BOB);
    expect(erased.erased).toBe(1);
    expect(await svc.getEnrollment(T1, BOB)).toBeNull();
    // After erase there is no enrollment to verify against.
    await expect(
      svc.verify(T1, { contactId: BOB, region: 'US-NY', sample: 'bob-voice' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'NOT_FOUND');

    const audits = await svc.listAudits(T1, BOB);
    const events = audits.map((a) => a.event);
    expect(events).toContain('enroll');
    expect(events).toContain('erase');
  });
});

describe('Isolation (self-audit B)', () => {
  it('a tenant never sees another tenant’s enrollment', async () => {
    // T1 has ALICE enrolled; T2 must not see it (and T2 has biometrics disabled anyway).
    expect(await svc.getEnrollment(T2, ALICE)).toBeNull();
    await expect(
      svc.verify(T2, { contactId: ALICE, region: 'US-NY', sample: 'alice-voice' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION'); // disabled for T2
    expect(await svc.listAudits(T2)).toHaveLength(0);
  });
});
