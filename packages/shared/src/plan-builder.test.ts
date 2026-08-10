import { describe, expect, it } from 'vitest';
import {
  type PricingSnapshot,
  diffPricingFields,
  planInputSchema,
  planUpdateStrategy,
} from './plan-builder.js';

const base: PricingSnapshot = {
  priceMonthly: 9900,
  currency: 'USD',
  includedMinutes: 1000,
  agentLimit: 10,
  numberLimit: 3,
  sipLimit: 1,
  overageRatePerMin: 12,
};

describe('planInputSchema', () => {
  it('coerces currency to upper-case and applies limit defaults', () => {
    const p = planInputSchema.parse({ name: 'Pro', priceMonthly: 9900, currency: 'usd' });
    expect(p.currency).toBe('USD');
    expect(p.agentLimit).toBe(1);
    expect(p.features).toEqual({});
  });
  it('rejects a negative price and a bad currency length', () => {
    expect(() => planInputSchema.parse({ name: 'X', priceMonthly: -1 })).toThrow();
    expect(() => planInputSchema.parse({ name: 'X', priceMonthly: 0, currency: 'US' })).toThrow();
  });
  it('validates feature values as flat primitives', () => {
    const p = planInputSchema.parse({
      name: 'Scale',
      priceMonthly: 49900,
      features: { whiteLabel: true, seats: 25, tier: 'gold' },
    });
    expect(p.features.whiteLabel).toBe(true);
  });
});

describe('diffPricingFields', () => {
  it('detects only the changed pricing fields', () => {
    expect(diffPricingFields(base, base)).toEqual([]);
    expect(diffPricingFields(base, { ...base, priceMonthly: 8900 })).toEqual(['priceMonthly']);
    expect(diffPricingFields(base, { ...base, includedMinutes: 2000, sipLimit: 5 }).sort()).toEqual(
      ['includedMinutes', 'sipLimit'],
    );
  });
});

describe('planUpdateStrategy (grandfathering)', () => {
  it('updates in place when there are no subscribers', () => {
    const s = planUpdateStrategy(base, { ...base, priceMonthly: 7900 }, false);
    expect(s.action).toBe('update');
    expect(s.changedPricing).toEqual(['priceMonthly']);
  });
  it('versions when a subscribed plan changes pricing (grandfather existing subs)', () => {
    const s = planUpdateStrategy(base, { ...base, priceMonthly: 12900 }, true);
    expect(s.action).toBe('version');
  });
  it('updates in place for a cosmetic-only change even with subscribers', () => {
    const s = planUpdateStrategy(base, base, true);
    expect(s.action).toBe('update');
    expect(s.changedPricing).toEqual([]);
  });
});
