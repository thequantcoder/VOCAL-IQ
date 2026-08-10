import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ResellerService } from './reseller.service';

/**
 * Reseller portal dashboards (Day 54) against real Postgres + RLS. Proves: the overview rolls up
 * ONLY the reseller's own client margins (never a sibling reseller's — self-audit B), the numbers
 * tie out to the engine (self-audit D), and markup config round-trips.
 *
 * Runs on DEDICATED tenants — never the shared seed reseller `…0002`. The markup test writes
 * `tenant.settings.markupBps` and this suite used to full-wipe the shared reseller's `settings` in
 * teardown, which clobbered other suites' settings mid-assertion under vitest's parallel file
 * execution (the settings cross-suite race). Its own reseller + client + a rival are created here
 * and dropped in afterAll, so no shared row is ever read-modified or wiped.
 */

const db = new PrismaService();
const svc = new ResellerService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const MYR = '00000000-0000-0000-0000-0000054a0003'; // this suite's own reseller
const MYC = '00000000-0000-0000-0000-0000054a0004'; // its only client (a child of MYR)
const RIVAL = '00000000-0000-0000-0000-0000054a0001'; // a rival reseller
const RIVAL_CHILD = '00000000-0000-0000-0000-0000054a0002';
const PERIOD = '2026-07';

beforeAll(async () => {
  // Dedicated reseller + client + rival. `update` resets MYR.settings so the default-markup
  // assertion holds even if a prior crashed run left `markupBps` behind.
  await db.admin.tenant.upsert({
    where: { id: MYR },
    create: {
      id: MYR,
      type: 'RESELLER',
      name: 'MyReseller',
      slug: `myr-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: { settings: {} },
  });
  await db.admin.tenant.upsert({
    where: { id: MYC },
    create: {
      id: MYC,
      type: 'CUSTOMER',
      name: 'MyCo',
      slug: `myco-${Date.now()}`,
      parentTenantId: MYR,
    },
    update: {},
  });
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
  // Fresh margins for the period (idempotent across reruns).
  await db.admin.resellerMargin.deleteMany({
    where: { resellerTenantId: { in: [MYR, RIVAL] }, period: PERIOD },
  });
  // MYR earns margin on MYC; RIVAL earns on its own child (must NOT appear in MYR's overview).
  await db.admin.resellerMargin.create({
    data: {
      resellerTenantId: MYR,
      childTenantId: MYC,
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
    where: { resellerTenantId: { in: [MYR, RIVAL] }, period: PERIOD },
  });
  await db.admin.tenant.deleteMany({ where: { id: { in: [MYC, MYR, RIVAL_CHILD, RIVAL] } } });
});

describe('ResellerService.overview (reseller-scoped + ties out)', () => {
  it('rolls up only the reseller’s own client margins', async () => {
    const o = await svc.overview(MYR, PERIOD);
    expect(o.totalRevenueCents).toBe(900);
    expect(o.totalCostCents).toBe(600);
    expect(o.totalMarginCents).toBe(300);
    expect(o.clientCount).toBe(1);
    // The rival reseller's fat margin must NOT leak in.
    expect(o.topClients.some((c) => c.childTenantId === RIVAL_CHILD)).toBe(false);
    expect(o.topClients[0]?.childTenantId).toBe(MYC);
    expect(o.topClients[0]?.name).toBeTruthy(); // joined the client name
  });
});

describe('ResellerService markup', () => {
  it('round-trips the reseller markup (bps)', async () => {
    expect(await svc.getMarkupBps(MYR)).toBe(0); // default
    await svc.setMarkupBps(MYR, 4000);
    expect(await svc.getMarkupBps(MYR)).toBe(4000);
  });
});
