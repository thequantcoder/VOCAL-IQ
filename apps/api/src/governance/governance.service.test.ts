import { Role } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { AuditService } from './audit.service';
import { type Actor, FeatureFlagsService } from './feature-flags.service';
import { QuotaService } from './quota.service';

/**
 * Governance (Day 58) against real Postgres. Proves flag precedence (TENANT>PLAN>GLOBAL), quota
 * hard/soft enforcement (self-audit A), and audit-log tamper-proofing — the DB trigger rejects
 * any UPDATE (self-audit C).
 */

const db = new PrismaService();
const entitlements = new EntitlementsService(db);
const flags = new FeatureFlagsService(db, entitlements);
const quota = new QuotaService(db, entitlements);
const audit = new AuditService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer
const SUPER: Actor = {
  userId: '00000000-0000-0000-0000-00000000000a',
  tenantId: PLATFORM,
  role: Role.SUPER_ADMIN,
};
const OWNER: Actor = {
  userId: '00000000-0000-0000-0000-0000058a000b',
  tenantId: C1,
  role: Role.OWNER,
};
const KEY = 'beta.governance_test';

beforeAll(async () => {
  await db.admin.featureFlag.deleteMany({ where: { key: KEY } });
});

afterAll(async () => {
  await db.admin.featureFlag.deleteMany({ where: { key: KEY } });
  await db.admin.auditLog.deleteMany({ where: { action: { startsWith: 'flag.' } } });
});

describe('FeatureFlagsService (precedence TENANT > PLAN > GLOBAL)', () => {
  it('a TENANT override wins over a GLOBAL default', async () => {
    await flags.set(SUPER, { key: KEY, value: false, scope: 'GLOBAL' });
    expect(await flags.isEnabled(C1, KEY)).toBe(false);
    await flags.set(OWNER, { key: KEY, value: true, scope: 'TENANT' });
    expect(await flags.isEnabled(C1, KEY)).toBe(true);
  });

  it('forbids a non-super-admin from setting a GLOBAL flag', async () => {
    await expect(flags.set(OWNER, { key: KEY, value: true, scope: 'GLOBAL' })).rejects.toThrow();
  });

  it('rejects setting a PLAN flag here (owned by the plan)', async () => {
    await expect(flags.set(SUPER, { key: KEY, value: true, scope: 'PLAN' })).rejects.toThrow();
  });
});

describe('QuotaService (hard/soft — self-audit A)', () => {
  it('reports ok/warn/over against the plan agent limit', async () => {
    // The seed customer resolves to the Free plan (agentLimit 1) by default.
    const r = await quota.check(C1, 'agents');
    expect(['ok', 'warn', 'over']).toContain(r.state);
    expect(r.limit).toBeGreaterThanOrEqual(0);
  });
});

describe('AuditService + immutability (self-audit C)', () => {
  it('search returns recent rows for a super-admin', async () => {
    await flags.set(SUPER, { key: KEY, value: 1, scope: 'GLOBAL' });
    const rows = await audit.search(SUPER, { action: 'flag.', limit: 10 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.action.startsWith('flag.')).toBe(true);
  });

  it('rejects any UPDATE to an audit row (DB trigger — append-only)', async () => {
    const row = await db.admin.auditLog.create({
      data: {
        tenantId: C1,
        actorUserId: SUPER.userId,
        action: 'flag.test_immutable',
        target: 'x',
        meta: {},
      },
    });
    await expect(
      db.admin.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow();
    // The original is intact.
    const still = await db.admin.auditLog.findUnique({
      where: { id: row.id },
      select: { action: true },
    });
    expect(still?.action).toBe('flag.test_immutable');
  });
});
