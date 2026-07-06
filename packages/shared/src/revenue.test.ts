import { describe, expect, it } from 'vitest';
import {
  type CostRow,
  type RevenueRow,
  attributeRoi,
  funnel,
  revenueEventSchema,
  roi,
  totalRoi,
  usdToCents,
} from './revenue.js';

describe('revenueEventSchema', () => {
  it('requires a positive integer amount, normalises currency', () => {
    const p = revenueEventSchema.parse({ amountCents: 50000, currency: 'usd', source: 'payment' });
    expect(p.currency).toBe('USD');
    expect(p.source).toBe('payment');
    expect(revenueEventSchema.safeParse({ amountCents: 0 }).success).toBe(false);
    expect(revenueEventSchema.safeParse({ amountCents: 10.5 }).success).toBe(false);
  });
});

describe('usdToCents', () => {
  it('converts float USD to integer cents', () => {
    expect(usdToCents(0.1)).toBe(10);
    expect(usdToCents(1.01)).toBe(101);
    expect(usdToCents(12.3456)).toBe(1235); // rounds to the nearest cent
    expect(usdToCents(0)).toBe(0);
  });
});

describe('roi (self-audit A/D — exact math)', () => {
  it('computes profit, ROI% and margin%', () => {
    const r = roi(10000, 2500); // $100 revenue, $25 cost
    expect(r.profitCents).toBe(7500);
    expect(r.roiPercent).toBe(300); // 7500/2500 = 300%
    expect(r.marginPercent).toBe(75); // 7500/10000 = 75%
  });
  it('handles a loss', () => {
    const r = roi(1000, 4000);
    expect(r.profitCents).toBe(-3000);
    expect(r.roiPercent).toBe(-75);
    expect(r.marginPercent).toBe(-300);
  });
  it('returns null (not Infinity/NaN) when cost or revenue is 0', () => {
    expect(roi(5000, 0).roiPercent).toBeNull(); // ROI undefined with no cost
    expect(roi(5000, 0).marginPercent).toBe(100);
    expect(roi(0, 3000).marginPercent).toBeNull(); // margin undefined with no revenue
    expect(roi(0, 3000).roiPercent).toBe(-100);
    expect(roi(0, 0)).toMatchObject({ roiPercent: null, marginPercent: null, profitCents: 0 });
  });
});

describe('attributeRoi', () => {
  const revenue: RevenueRow[] = [
    { key: 'agentA', amountCents: 10000 },
    { key: 'agentA', amountCents: 5000 },
    { key: 'agentB', amountCents: 20000 },
    { key: null, amountCents: 1000 }, // unattributed
  ];
  const cost: CostRow[] = [
    { key: 'agentA', costCents: 3000 },
    { key: 'agentB', costCents: 8000 },
    { key: 'agentC', costCents: 500 }, // cost but no revenue
  ];

  it('joins revenue + cost per key, sorted by revenue desc', () => {
    const rows = attributeRoi(revenue, cost);
    expect(rows.map((r) => r.key)).toEqual(['agentB', 'agentA', 'unattributed', 'agentC']);
    const a = rows.find((r) => r.key === 'agentA');
    expect(a).toMatchObject({ revenueCents: 15000, costCents: 3000, deals: 2, profitCents: 12000 });
  });
  it('folds null keys into an unattributed bucket (no money dropped)', () => {
    const rows = attributeRoi(revenue, cost);
    const u = rows.find((r) => r.key === 'unattributed');
    expect(u).toMatchObject({ revenueCents: 1000, deals: 1 });
  });
  it('a cost-only key shows negative profit with null margin', () => {
    const rows = attributeRoi(revenue, cost);
    const c = rows.find((r) => r.key === 'agentC');
    expect(c).toMatchObject({
      revenueCents: 0,
      costCents: 500,
      profitCents: -500,
      marginPercent: null,
    });
  });
  it('totalRoi sums the portfolio', () => {
    const t = totalRoi(attributeRoi(revenue, cost));
    expect(t.revenueCents).toBe(36000);
    expect(t.costCents).toBe(11500);
    expect(t.profitCents).toBe(24500);
    expect(t.deals).toBe(4);
  });
});

describe('funnel', () => {
  it('computes step + overall conversion', () => {
    const f = funnel([
      { stage: 'leads', count: 100 },
      { stage: 'contacted', count: 60 },
      { stage: 'won', count: 15 },
    ]);
    expect(f[0]).toMatchObject({ stepPercent: null, overallPercent: null });
    expect(f[1]).toMatchObject({ stepPercent: 60, overallPercent: 60 });
    expect(f[2]).toMatchObject({ stepPercent: 25, overallPercent: 15 }); // 15/60=25%, 15/100=15%
  });
  it('guards divide-by-zero', () => {
    const f = funnel([
      { stage: 'leads', count: 0 },
      { stage: 'won', count: 0 },
    ]);
    expect(f[1]).toMatchObject({ stepPercent: 0, overallPercent: 0 });
  });
});
