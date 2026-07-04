import { describe, expect, it } from 'vitest';
import { aggregateResellerOverview, markupConfigSchema } from './reseller-dashboard.js';

describe('markupConfigSchema', () => {
  it('accepts a valid bps and rejects out-of-range/negative', () => {
    expect(markupConfigSchema.parse({ markupBps: 5000 }).markupBps).toBe(5000);
    expect(() => markupConfigSchema.parse({ markupBps: -1 })).toThrow();
    expect(() => markupConfigSchema.parse({ markupBps: 200_000 })).toThrow();
  });
});

describe('aggregateResellerOverview (ties out to the engine — self-audit D)', () => {
  const rows = [
    { childTenantId: 'a', name: 'Acme', revenueCents: 900, costCents: 600, marginCents: 0 },
    { childTenantId: 'b', name: 'Beta', revenueCents: 2000, costCents: 1500, marginCents: 0 },
    { childTenantId: 'c', name: 'Gamma', revenueCents: 100, costCents: 100, marginCents: 0 },
  ];

  it('sums revenue/cost/margin and computes the margin rate', () => {
    const o = aggregateResellerOverview('2026-07', rows);
    expect(o.totalRevenueCents).toBe(3000);
    expect(o.totalCostCents).toBe(2200);
    expect(o.totalMarginCents).toBe(800); // 3000 − 2200
    expect(o.clientCount).toBe(3);
    expect(o.marginRate).toBeCloseTo(800 / 3000);
  });

  it('ranks top clients by revenue and recomputes per-client margin', () => {
    const o = aggregateResellerOverview('2026-07', rows);
    expect(o.topClients.map((c) => c.childTenantId)).toEqual(['b', 'a', 'c']);
    expect(o.topClients[0]?.marginCents).toBe(500); // Beta: 2000 − 1500
  });

  it('respects topN and handles an empty period (no divide-by-zero)', () => {
    expect(aggregateResellerOverview('2026-07', rows, 1).topClients).toHaveLength(1);
    const empty = aggregateResellerOverview('2026-07', []);
    expect(empty.marginRate).toBe(0);
    expect(empty.totalMarginCents).toBe(0);
  });
});
