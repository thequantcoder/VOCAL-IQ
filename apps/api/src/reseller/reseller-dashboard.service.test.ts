import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ResellerService } from './reseller.service';

/**
 * Reseller portal dashboards (Day 54) against real Postgres + RLS. Proves: the overview rolls up
 * ONLY the reseller's own client margins (never a sibling reseller's — self-audit B), the numbers
 * tie out to the engine (self-audit D), and markup config round-trips.
 */

const db = new PrismaService();
const svc = new ResellerService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const R1 = '00000000-0000-0000-0000-000000000002'; // seed reseller
const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer (child of R1)
const RIVAL = '00000000-0000-0000-0000-0000054a0001'; // a rival reseller
const RIVAL_CHILD = '00000000-0000-0000-0000-0000054a0002';
const PERIOD = '2026-07';

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: RIVAL },
    create: {
      id: RIVAL,
      type: 'RESELLER',
      name: 'Rival',
      slug: `rival-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
  await db.admin.tenant.upsert({
    where: { id: RIVAL_CHILD },
    create: {
      id: RIVAL_CHILD,
      type: 'CUSTOMER',
      name: 'RivalCo',
      slug: `rivalco-${Date.now()}`,
      parentTenantId: RIVAL,
    },
    update: {},
  });
  // R1 earns margin on C1; RIVAL earns on its own child (must NOT appear in R1's overview).
  await db.admin.resellerMargin.create({
    data: {
      resellerTenantId: R1,
      childTenantId: C1,
      period: PERIOD,
      revenue: 900,
      cost: 600,
      margin: 300,
    },
  });
  await db.admin.resellerMargin.create({
    data: {
      resellerTenantId: RIVAL,
      childTenantId: RIVAL_CHILD,
      period: PERIOD,
      revenue: 9999,
      cost: 1,
      margin: 9998,
    },
  });
});

afterAll(async () => {
  await db.admin.resellerMargin.deleteMany({
    where: { resellerTenantId: { in: [R1, RIVAL] }, period: PERIOD },
  });
  await db.admin.tenant.deleteMany({ where: { id: { in: [RIVAL_CHILD, RIVAL] } } });
  // Restore R1 settings (markup test mutates it).
  await db.admin.tenant.update({ where: { id: R1 }, data: { settings: {} } });
});

describe('ResellerService.overview (reseller-scoped + ties out)', () => {
  it('rolls up only the reseller’s own client margins', async () => {
    const o = await svc.overview(R1, PERIOD);
    expect(o.totalRevenueCents).toBe(900);
    expect(o.totalCostCents).toBe(600);
    expect(o.totalMarginCents).toBe(300);
    expect(o.clientCount).toBe(1);
    // The rival reseller's fat margin must NOT leak in.
    expect(o.topClients.some((c) => c.childTenantId === RIVAL_CHILD)).toBe(false);
    expect(o.topClients[0]?.childTenantId).toBe(C1);
    expect(o.topClients[0]?.name).toBeTruthy(); // joined the client name
  });
});

describe('ResellerService markup', () => {
  it('round-trips the reseller markup (bps)', async () => {
    expect(await svc.getMarkupBps(R1)).toBe(0); // default
    await svc.setMarkupBps(R1, 4000);
    expect(await svc.getMarkupBps(R1)).toBe(4000);
  });
});
