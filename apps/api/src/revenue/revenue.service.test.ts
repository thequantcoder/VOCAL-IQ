import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { RevenueService } from './revenue.service';

/**
 * Revenue attribution (Day 81) — real Postgres, RLS-scoped. Proves record + the ROI dashboard
 * aggregation, and the CRITICAL cross-tenant isolation (self-audit B).
 */

const db = new PrismaService();
const svc = new RevenueService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000081a0001';
const T2 = '00000000-0000-0000-0000-0000081a0002';
const AGENT = '00000000-0000-0000-0000-0000081a00a1';

const WIN = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') };

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Rev ${id.slice(-4)}`,
        slug: `rev-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'Revenue Agent' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.revenueEvent.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('RevenueService.record + dashboard', () => {
  it('records revenue and attributes it per agent + source in the dashboard', async () => {
    await svc.record(T, {
      amountCents: 50000,
      source: 'payment',
      agentId: AGENT,
      occurredAt: '2026-06-01T12:00:00Z',
    });
    await svc.record(T, {
      amountCents: 30000,
      source: 'manual',
      agentId: AGENT,
      occurredAt: '2026-06-02T12:00:00Z',
    });

    const dash = await svc.dashboard(T, WIN);
    expect(dash.totals.revenueCents).toBe(80000);
    expect(dash.totals.deals).toBe(2);

    const agentRow = dash.byAgent.find((r) => r.key === AGENT);
    expect(agentRow).toMatchObject({ revenueCents: 80000, deals: 2 });

    // Portfolio totals must exactly equal the sum of the per-agent rows (self-audit A — no rounding
    // divergence, no dropped cost).
    const sumRevenue = dash.byAgent.reduce((s, r) => s + r.revenueCents, 0);
    const sumCost = dash.byAgent.reduce((s, r) => s + r.costCents, 0);
    expect(dash.totals.revenueCents).toBe(sumRevenue);
    expect(dash.totals.costCents).toBe(sumCost);
    expect(dash.truncated).toBe(false);

    const bySource = Object.fromEntries(dash.bySource.map((s) => [s.source, s.revenueCents]));
    expect(bySource).toEqual({ payment: 50000, manual: 30000 });

    // Funnel has the three stages; deals = 2.
    expect(dash.funnel.map((f) => f.stage)).toEqual(['leads', 'calls', 'deals']);
    expect(dash.funnel.find((f) => f.stage === 'deals')?.count).toBe(2);
  });

  it('rejects an invalid amount', async () => {
    await expect(svc.record(T, { amountCents: 0 })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('a dashboard with no revenue has null ROI, not NaN/Infinity', async () => {
    const empty = await svc.dashboard(T2, WIN);
    expect(empty.totals.revenueCents).toBe(0);
    expect(empty.totals.roiPercent).toBeNull();
    expect(empty.byAgent).toEqual([]);
  });
});

describe('RevenueService tenant isolation (self-audit B — CRITICAL)', () => {
  it('a second tenant never sees another tenant’s revenue', async () => {
    await svc.record(T, { amountCents: 12345, source: 'manual', agentId: AGENT });

    // T2's list + dashboard never include T's revenue.
    expect(await svc.list(T2)).toEqual([]);
    const t2 = await svc.dashboard(T2, WIN);
    expect(t2.totals.revenueCents).toBe(0);
    expect(t2.byAgent).toEqual([]);

    // T still sees its own.
    expect((await svc.list(T)).length).toBeGreaterThan(0);
  });
});
