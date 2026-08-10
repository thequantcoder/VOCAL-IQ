import { describe, expect, it } from 'vitest';
import {
  type ReputationSignals,
  brandedCallerIdSchema,
  pickHealthyNumber,
  restDecision,
  scoreReputation,
  warmupDailyCap,
} from './reputation.js';

const clean: ReputationSignals = {
  shortCallRatio: 0.1,
  blockRatio: 0.01,
  attestation: 'A',
  callsToday: 50,
};

describe('scoreReputation', () => {
  it('scores a clean number high + clean label', () => {
    const r = scoreReputation(clean);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.label).toBe('clean');
  });
  it('caps a carrier-flagged number low', () => {
    const r = scoreReputation({ ...clean, spamLabel: 'flagged' });
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.label).toBe('flagged');
  });
  it('deducts for blocks, short calls, and weak attestation', () => {
    const r = scoreReputation({
      ...clean,
      blockRatio: 0.2,
      shortCallRatio: 0.7,
      attestation: 'none',
    });
    expect(r.score).toBeLessThan(70);
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('restDecision (auto-remediation)', () => {
  it('rests a flagged number, longer when deeply damaged', () => {
    expect(restDecision(scoreReputation({ ...clean, spamLabel: 'flagged' })).rest).toBe(true);
    expect(restDecision({ score: 10, label: 'flagged', reasons: [] }).hours).toBe(72);
    expect(restDecision({ score: 30, label: 'flagged', reasons: [] }).hours).toBe(24);
  });
  it('does not rest a clean number', () => {
    expect(restDecision(scoreReputation(clean)).rest).toBe(false);
  });
});

describe('warmupDailyCap', () => {
  it('ramps a new number up to the target over two weeks', () => {
    expect(warmupDailyCap(0)).toBeLessThan(warmupDailyCap(7));
    expect(warmupDailyCap(7)).toBeLessThan(warmupDailyCap(14));
    expect(warmupDailyCap(14)).toBe(500);
    expect(warmupDailyCap(30)).toBe(500);
  });
});

describe('pickHealthyNumber (rotation)', () => {
  const now = 1_000_000;
  it('picks the highest-scoring usable number, skipping rested ones', () => {
    const nums = [
      { id: 'a', e164: '+1a', score: 90, label: 'clean' as const, restedUntil: null, ageDays: 30 },
      {
        id: 'b',
        e164: '+1b',
        score: 95,
        label: 'clean' as const,
        restedUntil: now + 10_000,
        ageDays: 30,
      }, // rested
      {
        id: 'c',
        e164: '+1c',
        score: 80,
        label: 'clean' as const,
        restedUntil: now - 10_000,
        ageDays: 30,
      }, // rest expired → usable
    ];
    expect(pickHealthyNumber(nums, now)?.id).toBe('a'); // b is higher but rested
  });
  it('returns null when all are rested', () => {
    expect(
      pickHealthyNumber(
        [{ id: 'a', e164: '+1a', score: 90, label: 'clean', restedUntil: now + 1000, ageDays: 1 }],
        now,
      ),
    ).toBeNull();
  });
});

describe('brandedCallerIdSchema', () => {
  it('validates a display name + optional logo', () => {
    expect(brandedCallerIdSchema.parse({ displayName: 'Acme Support' }).displayName).toBe(
      'Acme Support',
    );
    expect(() => brandedCallerIdSchema.parse({ displayName: '' })).toThrow();
  });
});
