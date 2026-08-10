import { describe, expect, it } from 'vitest';
import {
  type PlatformTenantCounts,
  aggregatePlatformOverview,
  deriveHealthStatus,
  impersonateInputSchema,
  tenantSearchSchema,
} from './superadmin.js';

const counts: PlatformTenantCounts = {
  total: 5,
  resellers: 2,
  customers: 2,
  active: 3,
  suspended: 1,
  trial: 1,
};

describe('tenantSearchSchema', () => {
  it('defaults page/pageSize and rejects a bad type/pageSize', () => {
    const p = tenantSearchSchema.parse({ query: 'acme' });
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(25);
    expect(() => tenantSearchSchema.parse({ type: 'NOPE' })).toThrow();
    expect(() => tenantSearchSchema.parse({ pageSize: 1000 })).toThrow();
  });
});

describe('impersonateInputSchema', () => {
  it('requires a uuid tenant + a reason (accountability)', () => {
    expect(
      impersonateInputSchema.parse({
        tenantId: '00000000-0000-0000-0000-000000000003',
        reason: 'debugging a stuck call',
      }).reason,
    ).toContain('debugging');
    expect(() => impersonateInputSchema.parse({ tenantId: 'not-a-uuid', reason: 'x' })).toThrow();
    expect(() =>
      impersonateInputSchema.parse({
        tenantId: '00000000-0000-0000-0000-000000000003',
        reason: 'no', // < 3 chars
      }),
    ).toThrow();
  });
});

describe('aggregatePlatformOverview (ties out — self-audit D)', () => {
  const rows = [
    { resellerTenantId: 'r1', revenueCents: 1200, costCents: 800 },
    { resellerTenantId: 'r1', revenueCents: 300, costCents: 100 },
    { resellerTenantId: 'r2', revenueCents: 500, costCents: 500 },
  ];

  it('sums gross revenue/cost/margin across all resellers and computes the rate', () => {
    const o = aggregatePlatformOverview('2026-07', rows, counts);
    expect(o.grossRevenueCents).toBe(2000);
    expect(o.providerCostCents).toBe(1400);
    expect(o.totalMarginCents).toBe(600);
    expect(o.marginRate).toBeCloseTo(600 / 2000);
    expect(o.tenants.resellers).toBe(2);
  });

  it('handles an empty period without divide-by-zero', () => {
    const o = aggregatePlatformOverview('2026-07', [], counts);
    expect(o.grossRevenueCents).toBe(0);
    expect(o.marginRate).toBe(0);
    expect(o.totalMarginCents).toBe(0);
  });
});

describe('deriveHealthStatus (worst band wins; DB down dominates)', () => {
  it('is ok when everything is under threshold', () => {
    expect(deriveHealthStatus({ dbOk: true, queueDepth: 10, errorRate: 0.01 })).toBe('ok');
  });
  it('degrades on a moderate queue backlog', () => {
    expect(deriveHealthStatus({ dbOk: true, queueDepth: 200, errorRate: 0 })).toBe('degraded');
  });
  it('goes down on a high error rate even if the queue is fine', () => {
    expect(deriveHealthStatus({ dbOk: true, queueDepth: 0, errorRate: 0.3 })).toBe('down');
  });
  it('is down whenever the DB is unreachable, regardless of other signals', () => {
    expect(deriveHealthStatus({ dbOk: false, queueDepth: 0, errorRate: 0 })).toBe('down');
  });
});
