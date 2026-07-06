import { describe, expect, it } from 'vitest';
import { type FraudSignals, decideFraudResponse, fraudPolicySchema, kycGate } from './fraud.js';

const policy = fraudPolicySchema.parse({});

const clean: FraudSignals = {
  callsLastMinute: 5,
  callsLastHour: 40,
  distinctDestinations: 35,
  shortCallRatio: 0.1,
  failureRatio: 0.05,
  accountAgeDays: 200,
  kycVerified: true,
  dncHitRatio: 0,
  bannedContentHits: 0,
  distinctCountries: 1,
};

describe('fraudPolicySchema', () => {
  it('defaults the escalation thresholds', () => {
    expect(policy.suspendScore).toBe(85);
    expect(policy.pauseScore).toBe(70);
  });
});

describe('decideFraudResponse (escalation ladder)', () => {
  it('allows clean behaviour', () => {
    expect(decideFraudResponse(clean, policy).action).toBe('allow');
  });

  it('suspends (review required) on DNC violations + banned content over the hourly cap', () => {
    const d = decideFraudResponse(
      { ...clean, callsLastHour: 600, dncHitRatio: 0.2, bannedContentHits: 3, shortCallRatio: 0.8 },
      policy,
    );
    expect(d.action).toBe('suspend_tenant');
    expect(d.reviewRequired).toBe(true);
    expect(d.reasons).toEqual(
      expect.arrayContaining([
        'repeated DNC/suppression hits (violation attempts)',
        expect.stringContaining('banned-content'),
      ]),
    );
  });

  it('pauses campaigns at a mid-high score', () => {
    const d = decideFraudResponse(
      {
        ...clean,
        callsLastHour: 300,
        distinctDestinations: 2,
        shortCallRatio: 0.9,
        dncHitRatio: 0.06,
      },
      policy,
    );
    expect(['pause_campaigns', 'suspend_tenant']).toContain(d.action);
  });

  it('flags a sudden multi-country spread', () => {
    const d = decideFraudResponse(
      { ...clean, callsLastHour: 40, distinctCountries: 8, dncHitRatio: 0.06 },
      policy,
    );
    expect(d.reasons).toContain('sudden multi-country calling spread');
  });
});

describe('kycGate', () => {
  it('blocks a new unverified tenant scaling past the threshold', () => {
    const g = kycGate({ kycVerified: false, accountAgeDays: 2, callsLastHour: 300 }, policy);
    expect(g.allowed).toBe(false);
    expect(g.reason).toContain('KYC');
  });
  it('allows a verified tenant at high volume', () => {
    expect(
      kycGate({ kycVerified: true, accountAgeDays: 2, callsLastHour: 300 }, policy).allowed,
    ).toBe(true);
  });
  it('allows an established tenant even unverified', () => {
    expect(
      kycGate({ kycVerified: false, accountAgeDays: 30, callsLastHour: 300 }, policy).allowed,
    ).toBe(true);
  });
  it('allows low volume regardless', () => {
    expect(
      kycGate({ kycVerified: false, accountAgeDays: 1, callsLastHour: 10 }, policy).allowed,
    ).toBe(true);
  });
});
