import { ForbiddenError, Role, ValidationError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildEncryptor } from '../crypto/envelope';
import { PrismaService } from '../db/prisma.service';
import type { Actor } from '../vault/vault.service';
import { MessagingKeyVault } from './messaging-key-vault';

/**
 * GME-01 BYOK messaging vault against real Postgres. Proves: multi-field credential sets round-trip
 * through envelope encryption, resolution is BYOK → platform → env in that order, reads are masked
 * (secrets never returned), platform scope is SUPER_ADMIN-only, and a tenant can neither resolve nor
 * manage another tenant's credentials (self-audit B/C).
 */

const db = new PrismaService();
const enc = buildEncryptor({} as NodeJS.ProcessEnv); // deterministic dev master key

// Seeded tenants (same ids the messaging service test uses).
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';

// actorUserId is a UUID column — use valid UUIDs (the audit row stores them).
const ownerC1: Actor = {
  userId: '00000000-0000-0000-0000-0000000000a1',
  tenantId: C1,
  role: Role.OWNER,
};
const ownerR1: Actor = {
  userId: '00000000-0000-0000-0000-0000000000a2',
  tenantId: R1,
  role: Role.OWNER,
};
const superAdmin: Actor = {
  userId: '00000000-0000-0000-0000-0000000000a3',
  tenantId: C1,
  role: Role.SUPER_ADMIN,
};

const vault = new MessagingKeyVault(db, enc, {} as NodeJS.ProcessEnv);

afterAll(async () => {
  await db.admin.messagingCredential.deleteMany({
    where: { OR: [{ tenantId: { in: [C1, R1] } }, { providerId: { in: ['twilio', 'telegram'] } }] },
  });
  await db.admin.auditLog.deleteMany({ where: { action: { startsWith: 'messaging.cred.' } } });
});

describe('MessagingKeyVault set + resolve (round-trip)', () => {
  it('stores a multi-field set encrypted and resolves it back as BYOK', async () => {
    const dto = await vault.setCredential(ownerC1, {
      providerId: 'twilio',
      creds: { accountSid: 'ACxxxx', authToken: 'secret-token-1234', from: '+15550000001' },
      scope: 'tenant',
    });
    // Masked view: secret field → last-4 hint, non-secret shown.
    expect(dto.fields.authToken).toBe('••••1234');
    expect(dto.fields.accountSid).toBe('ACxxxx');
    expect(dto.scope).toBe('tenant');

    const resolved = await vault.resolve(C1, 'twilio');
    expect(resolved?.mode).toBe('byok');
    expect(resolved?.creds).toEqual({
      accountSid: 'ACxxxx',
      authToken: 'secret-token-1234',
      from: '+15550000001',
    });
  });

  it('re-setting a provider replaces (one row per tenant+provider)', async () => {
    await vault.setCredential(ownerC1, {
      providerId: 'twilio',
      creds: { accountSid: 'ACyyyy', authToken: 'rotated-9999', from: '+15550000002' },
      scope: 'tenant',
    });
    const list = await vault.listCredentials(ownerC1, 'tenant');
    expect(list.filter((c) => c.providerId === 'twilio')).toHaveLength(1);
    expect((await vault.resolve(C1, 'twilio'))?.creds.authToken).toBe('rotated-9999');
  });

  it('rejects a missing required field and an unknown provider', async () => {
    await expect(
      vault.setCredential(ownerC1, {
        providerId: 'twilio',
        creds: { accountSid: 'AC', from: '+1' }, // no authToken
        scope: 'tenant',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      vault.setCredential(ownerC1, { providerId: 'nope', creds: {}, scope: 'tenant' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('MessagingKeyVault resolution precedence', () => {
  it('falls back to a platform-managed row, then to env', async () => {
    // No BYOK for R1 → a platform row (SUPER_ADMIN) is used.
    await vault.setCredential(superAdmin, {
      providerId: 'twilio',
      creds: { accountSid: 'ACplat', authToken: 'plat-token-5678', from: '+15550009999' },
      scope: 'platform',
    });
    const viaPlatform = await vault.resolve(R1, 'twilio');
    expect(viaPlatform?.mode).toBe('managed');
    expect(viaPlatform?.creds.accountSid).toBe('ACplat');

    // No DB row at all for telegram → env fallback (managed).
    const envVault = new MessagingKeyVault(db, enc, {
      TELEGRAM_BOT_TOKEN: 'bot:ABC',
    } as NodeJS.ProcessEnv);
    const viaEnv = await envVault.resolve(R1, 'telegram');
    expect(viaEnv).toEqual({
      providerId: 'telegram',
      creds: { botToken: 'bot:ABC' },
      mode: 'managed',
    });

    // Nothing configured → null (send stays gated).
    expect(await vault.resolve(R1, 'rcs-gateway')).toBeNull();
  });
});

describe('MessagingKeyVault authorization + isolation (self-audit B/C)', () => {
  it('only a super-admin can write platform-scope credentials', async () => {
    await expect(
      vault.setCredential(ownerC1, {
        providerId: 'telegram',
        creds: { botToken: 'x' },
        scope: 'platform',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a tenant cannot delete another tenant’s credential', async () => {
    const c1 = await vault.setCredential(ownerC1, {
      providerId: 'telegram',
      creds: { botToken: 'c1-bot' },
      scope: 'tenant',
    });
    await expect(vault.deleteCredential(ownerR1, c1.id)).rejects.toBeInstanceOf(ForbiddenError);
    // R1 resolving its own telegram (no BYOK, no platform row, no env on `vault`) → null, never C1's.
    expect(await vault.resolve(R1, 'telegram')).toBeNull();
  });

  it('lists only the actor’s own tenant credentials (masked)', async () => {
    const c1List = await vault.listCredentials(ownerC1, 'tenant');
    expect(c1List.every((c) => c.scope === 'tenant')).toBe(true);
    // No plaintext secret is ever present in a listed field value.
    expect(JSON.stringify(c1List)).not.toContain('rotated-9999');
    expect(JSON.stringify(c1List)).not.toContain('c1-bot');
  });
});
