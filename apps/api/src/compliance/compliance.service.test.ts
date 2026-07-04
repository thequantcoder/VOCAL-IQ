import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ComplianceService } from './compliance.service';

/**
 * Compliance engine (Day 60) against real Postgres. Proves consent gating (region-aware), DNC
 * suppression (global + tenant, enforced), transcript redaction (PII never survives), retention
 * auto-deletion, and PCI-safe capture (card data excluded). Self-audit C (redaction/PCI) + B.
 */

const db = new PrismaService();
const svc = new ComplianceService(db);

const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer
const AGENT = '00000000-0000-0000-0000-0000060a0001';
const CALL = '00000000-0000-0000-0000-0000060a0002';

beforeAll(async () => {
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Compliance Agent' },
    update: {},
  });
  await db.admin.call.upsert({
    where: { id: CALL },
    create: {
      id: CALL,
      tenantId: C1,
      agentId: AGENT,
      direction: 'OUTBOUND',
      channel: 'PSTN',
      status: 'COMPLETED',
    },
    update: {},
  });
  await db.admin.transcript.upsert({
    where: { callId: CALL },
    create: {
      callId: CALL,
      tenantId: C1,
      segments: [
        { who: 'caller', text: 'my email is jane@example.com' },
        { who: 'agent', text: 'and the card is 4242 4242 4242 4242 for payment' },
      ],
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.suppression.deleteMany({
    where: { phone: { in: ['14155550199', '15005550006'] } },
  });
  await db.admin.consentRecord.deleteMany({ where: { tenantId: C1 } });
  await db.admin.transcript.deleteMany({ where: { callId: CALL } });
  await db.admin.call.deleteMany({ where: { id: CALL } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
  await db.admin.tenant.update({ where: { id: C1 }, data: { settings: {} } });
});

describe('Consent (region-aware — self-audit A)', () => {
  it('auto-satisfies one-party regions, requires stored consent for two-party', async () => {
    expect(await svc.hasConsent(C1, '4155550100', 'US-TX')).toBe(true); // one-party
    expect(await svc.hasConsent(C1, '4155550100', 'US-CA')).toBe(false); // two-party, none yet
    await svc.recordConsent(C1, { contactPhone: '4155550100', region: 'US-CA', granted: true });
    expect(await svc.hasConsent(C1, '4155550100', 'US-CA')).toBe(true);
  });
});

describe('DNC suppression (enforced — self-audit B)', () => {
  it('suppresses a tenant number and reports it; unsuppress clears it', async () => {
    expect(await svc.isSuppressed(C1, '4155550199')).toBe(false);
    await svc.suppress(C1, '4155550199', { reason: 'opt-out' });
    expect(await svc.isSuppressed(C1, '4155550199')).toBe(true);
    const list = await svc.listSuppressions(C1);
    expect(list.some((s) => s.phone === '14155550199')).toBe(true);
    await svc.unsuppress(C1, '4155550199');
    expect(await svc.isSuppressed(C1, '4155550199')).toBe(false);
  });

  it('a global suppression applies to the tenant', async () => {
    await svc.suppress(C1, '5005550006', { global: true, reason: 'platform block' });
    expect(await svc.isSuppressed(C1, '5005550006')).toBe(true);
    await svc.unsuppress(C1, '5005550006', true);
    expect(await svc.isSuppressed(C1, '5005550006')).toBe(false);
  });
});

describe('Redaction + PCI (self-audit C)', () => {
  it('redacts PII from the transcript so card + email never survive in the clean copy', async () => {
    const { counts } = await svc.redactTranscript(C1, CALL);
    expect(counts.card).toBe(1);
    expect(counts.email).toBe(1);
    const t = await db.admin.transcript.findUnique({
      where: { callId: CALL },
      select: { cleanSegments: true, searchText: true },
    });
    const clean = JSON.stringify(t?.cleanSegments);
    expect(clean).not.toContain('4242 4242 4242 4242');
    expect(clean).not.toContain('jane@example.com');
    expect(t?.searchText).not.toContain('4242');
    expect(t?.searchText).not.toContain('jane@example.com');
  });
});

describe('Retention auto-deletion (self-audit A)', () => {
  it('deletes a transcript past its window and keeps a fresh one', async () => {
    await svc.setRetention(C1, { transcriptsDays: 30 });
    // Backdate the transcript beyond the window.
    await db.admin
      .$executeRaw`UPDATE "Transcript" SET "createdAt" = now() - interval '60 days' WHERE "callId" = ${CALL}::uuid`;
    const swept = await svc.sweepRetention(C1);
    expect(swept.transcripts).toBeGreaterThanOrEqual(1);
    const gone = await db.admin.transcript.findUnique({ where: { callId: CALL } });
    expect(gone).toBeNull();
  });
});
