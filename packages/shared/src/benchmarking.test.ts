import { describe, expect, it } from 'vitest';
import {
  MIN_PEER_COHORT,
  benchmarkSettingsSchema,
  peerCohortSufficient,
  percentileRank,
  recommendationsFrom,
  summarize,
  toPeerSummary,
} from './benchmarking.js';

describe('k-anonymity gate (self-audit B)', () => {
  it('withholds a peer aggregate below the cohort threshold', () => {
    expect(peerCohortSufficient(MIN_PEER_COHORT - 1)).toBe(false);
    expect(peerCohortSufficient(MIN_PEER_COHORT)).toBe(true);
    expect(peerCohortSufficient(0)).toBe(false);
    expect(MIN_PEER_COHORT).toBeGreaterThanOrEqual(5);
  });
});

describe('summarize (pure stats)', () => {
  it('computes count/mean/median/quartiles, ignoring nulls', () => {
    const s = summarize([10, 20, 30, 40, null, Number.NaN, 50]);
    expect(s.count).toBe(5);
    expect(s.mean).toBe(30);
    expect(s.median).toBe(30);
    expect(s.min).toBe(10);
    expect(s.max).toBe(50);
    expect(s.p25).toBeGreaterThanOrEqual(10);
    expect(s.p75).toBeLessThanOrEqual(50);
  });
  it('is safe on an empty set', () => {
    expect(summarize([]).count).toBe(0);
    expect(summarize([null, undefined]).mean).toBe(0);
  });
  it('toPeerSummary drops min/max (a single peer’s exact value — self-audit B)', () => {
    const peer = toPeerSummary(summarize([10, 20, 30, 40, 50]));
    expect(Object.keys(peer).sort()).toEqual(['count', 'mean', 'median', 'p25', 'p75'].sort());
    expect(peer).not.toHaveProperty('min');
    expect(peer).not.toHaveProperty('max');
  });
});

describe('percentileRank (direction-aware)', () => {
  const peers = [10, 20, 30, 40, 50];
  it('higher-is-better: a bigger value ranks higher', () => {
    expect(percentileRank(50, peers, true)).toBe(100); // beats/ties all
    expect(percentileRank(10, peers, true)).toBe(20); // beats/ties only itself
  });
  it('lower-is-better: a smaller value ranks higher (e.g. cost)', () => {
    expect(percentileRank(10, peers, false)).toBe(100); // cheapest → best
    expect(percentileRank(50, peers, false)).toBe(20);
  });
  it('returns 50 with no peers', () => {
    expect(percentileRank(42, [], true)).toBe(50);
  });
});

describe('recommendationsFrom (gaps → advice)', () => {
  it('flags a metric where the tenant trails the reference (higher-is-better)', () => {
    const recs = recommendationsFrom({ successRate: 40 }, { successRate: 80 }, 'peer');
    expect(recs).toHaveLength(1);
    expect(recs[0]!.metric).toBe('successRate');
    expect(recs[0]!.gap).toBe(40);
    expect(recs[0]!.message).toContain('peer median');
  });
  it('flags a lower-is-better metric where the tenant is more expensive', () => {
    const recs = recommendationsFrom({ costPerCallUsd: 0.5 }, { costPerCallUsd: 0.2 }, 'internal');
    expect(recs.some((r) => r.metric === 'costPerCallUsd')).toBe(true);
    expect(recs[0]!.message).toContain('your best agent');
  });
  it('does not recommend when the tenant is ahead or within tolerance', () => {
    expect(recommendationsFrom({ successRate: 85 }, { successRate: 80 }, 'peer')).toHaveLength(0);
    // within 5% tolerance
    expect(recommendationsFrom({ roiPercent: 98 }, { roiPercent: 100 }, 'peer')).toHaveLength(0);
  });
  it('skips metrics with missing values on either side', () => {
    expect(recommendationsFrom({ successRate: 40 }, {}, 'peer')).toHaveLength(0);
    expect(recommendationsFrom({}, { successRate: 80 }, 'peer')).toHaveLength(0);
  });
});

describe('benchmarkSettingsSchema', () => {
  it('parses opt-in + industry with a default', () => {
    expect(benchmarkSettingsSchema.parse({ optIn: true }).industry).toBe('other');
    expect(benchmarkSettingsSchema.parse({ optIn: false, industry: 'healthcare' }).industry).toBe(
      'healthcare',
    );
    expect(benchmarkSettingsSchema.safeParse({ optIn: true, industry: 'made_up' }).success).toBe(
      false,
    );
  });
});
