import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { NumbersService } from './numbers.service';

/**
 * Phone-number provisioning against real Postgres + RLS. Proves (on the MOCK carrier path, no creds):
 * search returns a catalogue, buy creates a tenant-scoped PhoneNumber (source PURCHASED) + meters it,
 * listOwned shows it, release removes it, the plan number-limit is enforced, and duplicate e164 is
 * rejected — all tenant-scoped (self-audit B).
 */

const db = new PrismaService();
// Force the mock path (no carrier creds) regardless of the ambient env.
const svc = new NumbersService(db, new EntitlementsService(db), {} as NodeJS.ProcessEnv);

const C1 = '00000000-0000-0000-0000-000000000003';
let planId: string;
let subId: string;

beforeAll(async () => {
  const plan = await db.admin.plan.create({
    data: { tenantId: C1, name: 'Numbers Test Plan', numberLimit: 2, agentLimit: 50 },
    select: { id: true },
  });
  planId = plan.id;
  const sub = await db.admin.subscription.create({
    data: { tenantId: C1, planId, status: 'ACTIVE' },
    select: { id: true },
  });
  subId = sub.id;
});

afterAll(async () => {
  await db.admin.phoneNumber.deleteMany({ where: { tenantId: C1 } });
  await db.admin.usageRecord.deleteMany({ where: { tenantId: C1 } });
  await db.admin.subscription.deleteMany({ where: { id: subId } });
  await db.admin.plan.deleteMany({ where: { id: planId } });
});

describe('NumbersService (mock carrier)', () => {
  it('is not live without carrier credentials', () => {
    expect(svc.live).toBe(false);
  });

  it('search returns a mock catalogue', async () => {
    const results = await svc.search(C1, {
      country: 'US',
      areaCode: '415',
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.mock).toBe(true);
    expect(results[0]?.e164).toMatch(/^\+1415/);
  });

  it('buys a number → creates a PURCHASED PhoneNumber + meters it, and lists it', async () => {
    const bought = await svc.buy(C1, { e164: '+14155559001' });
    expect(bought.source).toBe('PURCHASED');
    expect(bought.e164).toBe('+14155559001');

    const owned = await svc.listOwned(C1);
    expect(owned.map((n) => n.e164)).toContain('+14155559001');

    const metered = await db.admin.usageRecord.count({
      where: { tenantId: C1, capability: 'telephony', costUsd: { gt: 0 } },
    });
    expect(metered).toBeGreaterThan(0);
  });

  it('rejects a duplicate number', async () => {
    await expect(svc.buy(C1, { e164: '+14155559001' })).rejects.toThrow(/already in use/i);
  });

  it('enforces the plan number limit', async () => {
    await svc.buy(C1, { e164: '+14155559002' }); // now at the limit of 2
    await expect(svc.buy(C1, { e164: '+14155559003' })).rejects.toThrow(/plan allows/i);
  });

  it('releases a number (removes it from the pool)', async () => {
    const owned = await svc.listOwned(C1);
    const target = owned.find((n) => n.e164 === '+14155559002');
    expect(target).toBeDefined();
    const res = await svc.release(C1, target!.id);
    expect(res.released).toBe(true);
    const after = await svc.listOwned(C1);
    expect(after.map((n) => n.e164)).not.toContain('+14155559002');
  });
});
