import { describe, expect, it } from 'vitest';
import { type AbuseSignals, abusePolicySchema, evaluateAbuse } from './abuse.js';

const policy = abusePolicySchema.parse({});

const clean: AbuseSignals = {
  callsLastMinute: 5,
  callsLastHour: 40,
  distinctDestinations: 35,
  shortCallRatio: 0.1,
  failureRatio: 0.05,
  accountAgeDays: 120,
  kycVerified: true,
};

describe('abusePolicySchema', () => {
  it('defaults the caps + thresholds', () => {
    expect(policy.maxCallsPerMinute).toBe(30);
    expect(policy.blockScore).toBe(70);
  });
});

describe('evaluateAbuse (self-audit C)', () => {
  it('allows normal behaviour', () => {
    expect(evaluateAbuse(clean, policy).action).toBe('allow');
  });

  it('blocks on a hard per-minute velocity breach', () => {
    const v = evaluateAbuse({ ...clean, callsLastMinute: 60 }, policy);
    expect(v.action).toBe('block');
    expect(v.reasons).toContain('per-minute velocity cap exceeded');
  });

  it('flags a robocall signature (many short calls to few destinations)', () => {
    const v = evaluateAbuse(
      {
        ...clean,
        callsLastHour: 600,
        distinctDestinations: 2,
        shortCallRatio: 0.9,
        failureRatio: 0.6,
      },
      policy,
    );
    expect(v.action).toBe('block'); // hourly cap breach + composite score
    expect(v.reasons).toEqual(
      expect.arrayContaining([
        'high volume to very few destinations',
        'high ratio of very short calls (robocall signature)',
      ]),
    );
  });

  it('throttles a new unverified account ramping volume (mid-risk)', () => {
    const v = evaluateAbuse(
      {
        ...clean,
        callsLastMinute: 24, // 70-100% of the cap → +15
        callsLastHour: 60,
        distinctDestinations: 40,
        accountAgeDays: 1,
        kycVerified: false, // new + unverified + volume → +25
      },
      policy,
    );
    expect(v.action).toBe('throttle');
    expect(v.score).toBeGreaterThanOrEqual(policy.warnScore);
    expect(v.score).toBeLessThan(policy.blockScore);
  });

  it('caps the score at 100', () => {
    const v = evaluateAbuse(
      {
        callsLastMinute: 100,
        callsLastHour: 10_000,
        distinctDestinations: 1,
        shortCallRatio: 1,
        failureRatio: 1,
        accountAgeDays: 0,
        kycVerified: false,
      },
      policy,
    );
    expect(v.score).toBe(100);
    expect(v.action).toBe('block');
  });
});
