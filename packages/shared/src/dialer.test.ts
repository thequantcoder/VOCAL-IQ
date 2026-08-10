import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIALER_CONFIG,
  type DialCapacity,
  type DialStats,
  type DialerConfig,
  abandonRatePercent,
  computeDialBudget,
  dialerConfigSchema,
  parseDialerConfig,
  withinAbandonCap,
} from './dialer.js';

const cap = (over: Partial<DialCapacity> = {}): DialCapacity => ({
  freeAgents: 5,
  inFlight: 0,
  concurrency: 100,
  pacePerTick: 100,
  ...over,
});
const stats = (over: Partial<DialStats> = {}): DialStats => ({
  answerRatePercent: 40,
  abandonRatePercent: 0,
  abandonFeedLive: true,
  ...over,
});
const cfg = (over: Partial<DialerConfig> = {}): DialerConfig =>
  dialerConfigSchema.parse({ ...over });

describe('dialerConfigSchema', () => {
  it('defaults to progressive / pure-AI with a 3% abandon cap', () => {
    expect(DEFAULT_DIALER_CONFIG).toEqual({
      mode: 'progressive',
      blended: false,
      linesPerAgent: 1,
      maxAbandonRatePercent: 3,
      minAnswerRatePercent: 20,
    });
  });
  it('parseDialerConfig tolerates junk', () => {
    expect(parseDialerConfig(null)).toEqual(DEFAULT_DIALER_CONFIG);
    expect(parseDialerConfig({ mode: 'nope' })).toEqual(DEFAULT_DIALER_CONFIG);
    expect(parseDialerConfig({ mode: 'power', linesPerAgent: 3 }).mode).toBe('power');
  });
});

describe('abandon-rate helpers', () => {
  it('computes the rate and guards the cap', () => {
    expect(abandonRatePercent(3, 100)).toBe(3);
    expect(abandonRatePercent(0, 0)).toBe(0);
    expect(withinAbandonCap(3, 3)).toBe(true);
    expect(withinAbandonCap(3.1, 3)).toBe(false);
  });
});

describe('computeDialBudget — progressive (1:1)', () => {
  it('dials one per free agent, minus in-flight', () => {
    expect(computeDialBudget(cap({ freeAgents: 5, inFlight: 0 }), stats(), cfg())).toBe(5);
    expect(computeDialBudget(cap({ freeAgents: 5, inFlight: 2 }), stats(), cfg())).toBe(3);
  });
  it('never negative when in-flight exceeds free agents', () => {
    expect(computeDialBudget(cap({ freeAgents: 2, inFlight: 5 }), stats(), cfg())).toBe(0);
  });
});

describe('computeDialBudget — power (N:1)', () => {
  it('dials linesPerAgent per free agent', () => {
    const c = cfg({ mode: 'power', linesPerAgent: 2 });
    expect(computeDialBudget(cap({ freeAgents: 3, inFlight: 0 }), stats(), c)).toBe(6);
    expect(computeDialBudget(cap({ freeAgents: 3, inFlight: 2 }), stats(), c)).toBe(4);
  });
});

describe('computeDialBudget — predictive', () => {
  it('over-dials based on the answer rate to fill agents', () => {
    // 4 free agents at a 25% answer rate → dial 16 to expect ~4 connects.
    const c = cfg({ mode: 'predictive', minAnswerRatePercent: 10 });
    expect(computeDialBudget(cap({ freeAgents: 4 }), stats({ answerRatePercent: 25 }), c)).toBe(16);
  });
  it('floors the answer rate so a cold-start rate cannot over-dial without bound', () => {
    const c = cfg({ mode: 'predictive', minAnswerRatePercent: 25 });
    // answerRate 1% is floored to 25% → ceil(4 / 0.25) = 16, not 400.
    expect(computeDialBudget(cap({ freeAgents: 4 }), stats({ answerRatePercent: 1 }), c)).toBe(16);
  });
  it('falls back to safe 1:1 the moment the abandon cap is reached (self-audit C)', () => {
    const c = cfg({ mode: 'predictive', maxAbandonRatePercent: 3 });
    const s = stats({ answerRatePercent: 25, abandonRatePercent: 3 }); // at the cap
    expect(computeDialBudget(cap({ freeAgents: 4 }), s, c)).toBe(4); // progressive, not 16
  });
  it('fails SAFE — never over-dials when abandonment is not monitored (self-audit C)', () => {
    const c = cfg({ mode: 'predictive', minAnswerRatePercent: 10 });
    // No live abandon feed → predictive must NOT over-dial, even with a low measured abandon rate.
    const s = stats({ answerRatePercent: 25, abandonRatePercent: 0, abandonFeedLive: false });
    expect(computeDialBudget(cap({ freeAgents: 4 }), s, c)).toBe(4); // safe 1:1, not 16
  });
});

describe('computeDialBudget — hard caps (self-audit F, never storm)', () => {
  it('never exceeds the per-tick pace', () => {
    const c = cfg({ mode: 'power', linesPerAgent: 5 });
    expect(computeDialBudget(cap({ freeAgents: 10, pacePerTick: 7 }), stats(), c)).toBe(7);
  });
  it('never exceeds the remaining concurrency', () => {
    const c = cfg({ mode: 'predictive' });
    const s = stats({ answerRatePercent: 20 });
    expect(computeDialBudget(cap({ freeAgents: 10, inFlight: 8, concurrency: 10 }), s, c)).toBe(2); // concurrency 10 - inFlight 8
  });
  it('zero free agents → dial nothing', () => {
    expect(computeDialBudget(cap({ freeAgents: 0 }), stats(), cfg({ mode: 'predictive' }))).toBe(0);
  });
});
