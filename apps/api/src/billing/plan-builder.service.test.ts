import { Role } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type Actor, PlanBuilderService } from './plan-builder.service';
import { PendingBillingProcessor } from './processor';

/**
 * No-code plan builder (Day 56) against real Postgres. Proves scope isolation (self-audit B + C —
 * a reseller manages ONLY its own plans; global plans are super-admin only), versioning/
 * grandfathering (self-audit D — a subscribed plan's pricing edit forks a new version and leaves
 * the subscriber untouched), and the gated Stripe sync.
 */

const db = new PrismaService();
const svc = new PlanBuilderService(db, new PendingBillingProcessor());

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const R1 = '00000000-0000-0000-0000-000000000002'; // seed reseller
const R2 = '00000000-0000-0000-0000-0000056a0001'; // a rival reseller (this test)
const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer

const SUPER: Actor = {
  userId: '00000000-0000-0000-0000-00000000000a',
  tenantId: PLATFORM,
  role: Role.SUPER_ADMIN,
};
const RESELLER1: Actor = { userId: 'u1', tenantId: R1, role: Role.RESELLER_ADMIN };
const RESELLER2: Actor = { userId: 'u2', tenantId: R2, role: Role.RESELLER_ADMIN };

const createdPlanIds: string[] = [];
const createdSubIds: string[] = [];

const INPUT = {
  name: 'Test Pro',
  priceMonthly: 9900,
  currency: 'USD',
  includedMinutes: 1000,
  agentLimit: 10,
  numberLimit: 3,
  sipLimit: 1,
  overageRatePerMin: 12,
  features: { whiteLabel: true },
  isResellerPlan: false,
};

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: R2 },
    create: {
      id: R2,
      type: 'RESELLER',
      name: 'Rival Reseller',
      slug: `rival-r-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.subscription.deleteMany({ where: { id: { in: createdSubIds } } });
  // Break the self-reference before deleting versioned plans.
  await db.admin.plan.updateMany({
    where: { id: { in: createdPlanIds } },
    data: { supersededById: null },
  });
  await db.admin.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
  await db.admin.tenant.deleteMany({ where: { id: R2 } });
});

describe('PlanBuilderService.create (scope)', () => {
  it('lets a reseller create ONLY its own plan (tenantId hard-set to itself)', async () => {
    const plan = await svc.create(RESELLER1, { ...INPUT, name: 'R1 Plan' }, 'own');
    createdPlanIds.push(plan.id);
    expect(plan.tenantId).toBe(R1);
    expect(plan.version).toBe(1);
    expect(plan.active).toBe(true);
  });

  it('refuses a reseller trying to create a GLOBAL plan', async () => {
    await expect(svc.create(RESELLER1, { ...INPUT, name: 'Sneaky' }, 'global')).rejects.toThrow();
  });

  it('lets a super-admin create a global plan (tenantId null)', async () => {
    const plan = await svc.create(SUPER, { ...INPUT, name: 'Global Plan' }, 'global');
    createdPlanIds.push(plan.id);
    expect(plan.tenantId).toBeNull();
  });
});

describe('PlanBuilderService scope isolation (self-audit B)', () => {
  it("forbids a reseller from editing another reseller's plan", async () => {
    const r1Plan = await svc.create(RESELLER1, { ...INPUT, name: 'R1 Only' }, 'own');
    createdPlanIds.push(r1Plan.id);
    // R2 must not be able to touch R1's plan, nor see it in its list.
    await expect(svc.update(RESELLER2, r1Plan.id, INPUT)).rejects.toThrow();
    const r2List = await svc.list(RESELLER2);
    expect(r2List.some((p) => p.id === r1Plan.id)).toBe(false);
  });

  it('shows a reseller only global + its own plans', async () => {
    const list = await svc.list(RESELLER1);
    expect(list.every((p) => p.tenantId === null || p.tenantId === R1)).toBe(true);
  });
});

describe('PlanBuilderService.update (versioning / grandfathering — self-audit D)', () => {
  it('updates in place when the plan has no subscribers', async () => {
    const plan = await svc.create(SUPER, { ...INPUT, name: 'No Subs' }, 'own');
    createdPlanIds.push(plan.id);
    const updated = await svc.update(SUPER, plan.id, {
      ...INPUT,
      name: 'No Subs',
      priceMonthly: 7900,
    });
    expect(updated.id).toBe(plan.id); // same row
    expect(updated.priceMonthly).toBe(7900);
    expect(updated.version).toBe(1);
  });

  it('forks a NEW version on a pricing change when there are active subscribers', async () => {
    const plan = await svc.create(SUPER, { ...INPUT, name: 'Subbed' }, 'own');
    createdPlanIds.push(plan.id);
    // Give it an active subscriber (the seed customer).
    const sub = await db.admin.subscription.create({
      data: { tenantId: C1, planId: plan.id, status: 'ACTIVE' },
      select: { id: true },
    });
    createdSubIds.push(sub.id);

    const v2 = await svc.update(SUPER, plan.id, { ...INPUT, name: 'Subbed', priceMonthly: 12900 });
    createdPlanIds.push(v2.id);
    expect(v2.id).not.toBe(plan.id);
    expect(v2.version).toBe(2);
    expect(v2.priceMonthly).toBe(12900);
    expect(v2.active).toBe(true);

    // The old version is retired + linked; the subscriber is grandfathered onto it unchanged.
    const old = await db.admin.plan.findUnique({
      where: { id: plan.id },
      select: { active: true, supersededById: true, priceMonthly: true },
    });
    expect(old?.active).toBe(false);
    expect(old?.supersededById).toBe(v2.id);
    expect(old?.priceMonthly).toBe(9900); // subscriber's terms unchanged
    const stillOnOld = await db.admin.subscription.findUnique({
      where: { id: sub.id },
      select: { planId: true },
    });
    expect(stillOnOld?.planId).toBe(plan.id);
  });
});

describe('PlanBuilderService.sync (gated Stripe)', () => {
  it('is a safe no-op that leaves the plan usable when Stripe is not configured', async () => {
    const plan = await svc.create(SUPER, { ...INPUT, name: 'To Sync' }, 'own');
    createdPlanIds.push(plan.id);
    const res = await svc.sync(SUPER, plan.id);
    expect(res.synced).toBe(false);
    expect(res.plan.stripeProductId).toBeNull();
  });
});
