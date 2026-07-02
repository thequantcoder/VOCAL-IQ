import { describe, expect, it } from 'vitest';
import {
  type CallOutcome,
  type ExperimentVariant,
  aggregateResults,
  assignVariant,
  evaluateMetric,
  experimentConfigSchema,
  twoProportionTest,
} from './experiment.js';

const variants: ExperimentVariant[] = [
  { id: 'a', label: 'Control', weight: 1, config: {} },
  { id: 'b', label: 'Variant B', weight: 1, config: {} },
];

describe('assignVariant (stable split)', () => {
  it('assigns the same variant for the same key every time', () => {
    const first = assignVariant(variants, 'contact-123');
    for (let i = 0; i < 20; i++) {
      expect(assignVariant(variants, 'contact-123')).toBe(first);
    }
  });

  it('splits the population roughly by weight', () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) {
      const v = assignVariant(variants, `key-${i}`);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    // 50/50 split → each within 10% of half.
    expect(counts.a).toBeGreaterThan(800);
    expect(counts.b).toBeGreaterThan(800);
  });

  it('honours weights (3:1)', () => {
    const weighted: ExperimentVariant[] = [
      { id: 'a', label: 'A', weight: 3, config: {} },
      { id: 'b', label: 'B', weight: 1, config: {} },
    ];
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) {
      const v = assignVariant(weighted, `k-${i}`);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(counts.a).toBeGreaterThan(counts.b * 2); // ~3x
  });
});

describe('evaluateMetric', () => {
  it('scores per metric type', () => {
    const booked: CallOutcome = { variant: 'a', disposition: 'BOOKED', sentiment: 0.5 };
    const completed: CallOutcome = { variant: 'a', disposition: 'COMPLETED', sentiment: -0.5 };
    expect(evaluateMetric('booking', booked)).toBe(true);
    expect(evaluateMetric('booking', completed)).toBe(false);
    expect(evaluateMetric('conversion', completed)).toBe(true);
    expect(evaluateMetric('csat', booked)).toBe(true);
    expect(evaluateMetric('csat', completed)).toBe(false);
  });
});

describe('aggregateResults', () => {
  it('computes per-variant totals + rate, ignoring unassigned calls', () => {
    const calls: CallOutcome[] = [
      { variant: 'a', disposition: 'BOOKED', sentiment: 0 },
      { variant: 'a', disposition: 'NO_ANSWER', sentiment: 0 },
      { variant: 'b', disposition: 'BOOKED', sentiment: 0 },
      { variant: 'b', disposition: 'BOOKED', sentiment: 0 },
      { variant: null, disposition: 'BOOKED', sentiment: 0 }, // ignored
    ];
    const res = aggregateResults('booking', calls);
    const a = res.find((r) => r.variant === 'a');
    const b = res.find((r) => r.variant === 'b');
    expect(a?.total).toBe(2);
    expect(a?.rate).toBe(0.5);
    expect(b?.rate).toBe(1);
  });
});

describe('twoProportionTest (significance)', () => {
  it('flags a clear difference as significant', () => {
    // A: 20/200 = 10%, B: 60/200 = 30% — a big, real difference.
    const r = twoProportionTest(20, 200, 60, 200);
    expect(r.significant).toBe(true);
    expect(r.pValue).toBeLessThan(0.05);
    expect(r.lift).toBeCloseTo(2, 1); // 200% lift
  });

  it('does not flag a tiny difference on small samples', () => {
    const r = twoProportionTest(5, 50, 6, 50);
    expect(r.significant).toBe(false);
  });

  it('guards zero-sample cases (no NaN)', () => {
    const r = twoProportionTest(0, 0, 0, 0);
    expect(r.pValue).toBe(1);
    expect(r.significant).toBe(false);
    expect(Number.isNaN(r.z)).toBe(false);
  });
});

describe('experimentConfigSchema', () => {
  it('requires ≥2 variants and rejects duplicate ids', () => {
    expect(
      experimentConfigSchema.safeParse({ metric: 'booking', variants: [variants[0]] }).success,
    ).toBe(false);
    expect(
      experimentConfigSchema.safeParse({
        metric: 'booking',
        variants: [variants[0], { ...variants[0] }],
      }).success,
    ).toBe(false);
    expect(experimentConfigSchema.safeParse({ metric: 'conversion', variants }).success).toBe(true);
  });
});
