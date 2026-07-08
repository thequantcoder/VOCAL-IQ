import { describe, expect, it } from 'vitest';
import {
  biometricSettingsSchema,
  enrollInputSchema,
  isBiometricRegionAllowed,
  isValidEmbedding,
  matchScore,
  verifyDecision,
} from './biometrics.js';

describe('isValidEmbedding', () => {
  it('accepts a fixed-length finite non-zero vector, rejects the rest', () => {
    expect(isValidEmbedding(Array(32).fill(0.1))).toBe(true);
    expect(isValidEmbedding(Array(8).fill(0.1))).toBe(false); // too short
    expect(isValidEmbedding(Array(32).fill(0))).toBe(false); // all-zero (degenerate)
    expect(isValidEmbedding([1, 2, Number.NaN, ...Array(30).fill(1)])).toBe(false); // NaN
    expect(isValidEmbedding('nope')).toBe(false);
  });
});

describe('matchScore (pure)', () => {
  const a = Array(32).fill(0.5);
  it('is 1 for identical vectors, lower for divergent, 0 on mismatch/degenerate', () => {
    expect(matchScore(a, a)).toBeCloseTo(1, 5);
    const b = a.map((_, i) => (i % 2 === 0 ? 0.5 : -0.5));
    expect(matchScore(a, b)).toBeLessThan(matchScore(a, a));
    expect(matchScore(a, Array(16).fill(0.5))).toBe(0); // dim mismatch → 0, never throws
    expect(matchScore(a, Array(32).fill(0))).toBe(0); // zero-norm → 0
  });
  it('never returns a negative score (clamped to 0)', () => {
    const a2 = Array(16).fill(1);
    const opp = Array(16).fill(-1);
    expect(matchScore(a2, opp)).toBe(0);
  });
});

describe('verifyDecision (anti-spoof + threshold + step-up)', () => {
  it('a low-liveness sample is a SPOOF even at a perfect score (self-audit C)', () => {
    const d = verifyDecision({ score: 1, liveness: 0.1, threshold: 0.75, minLiveness: 0.5 });
    expect(d.outcome).toBe('spoof');
    expect(d.verified).toBe(false);
    expect(d.needsStepUp).toBe(true);
  });
  it('verifies a live sample at/above threshold', () => {
    const d = verifyDecision({ score: 0.8, liveness: 0.9, threshold: 0.75, minLiveness: 0.5 });
    expect(d.outcome).toBe('verified');
    expect(d.verified).toBe(true);
  });
  it('falls back to step-up for a live but low-confidence sample', () => {
    const d = verifyDecision({ score: 0.6, liveness: 0.9, threshold: 0.75, minLiveness: 0.5 });
    expect(d.outcome).toBe('step_up');
    expect(d.verified).toBe(false);
    expect(d.needsStepUp).toBe(true);
  });
});

describe('isBiometricRegionAllowed (DEFAULT DENY)', () => {
  it('allows only explicitly listed regions; empty list denies everywhere', () => {
    expect(isBiometricRegionAllowed('US-NY', ['US-NY', 'GB'])).toBe(true);
    expect(isBiometricRegionAllowed('us-ny', ['US-NY'])).toBe(true); // case-insensitive
    expect(isBiometricRegionAllowed('EU', ['US-NY'])).toBe(false); // not listed → denied
    expect(isBiometricRegionAllowed('US-NY', [])).toBe(false); // empty allowlist → deny all
    expect(isBiometricRegionAllowed('', ['US-NY'])).toBe(false);
  });
});

describe('schemas', () => {
  it('biometricSettings defaults to OFF + deny-all', () => {
    const s = biometricSettingsSchema.parse({});
    expect(s.enabled).toBe(false);
    expect(s.allowedRegions).toEqual([]);
    expect(s.threshold).toBeGreaterThanOrEqual(0.5);
  });
  it('enrollment REQUIRES explicit consent === true', () => {
    const base = { contactId: 'c1', region: 'US-NY', sample: 'aud' };
    expect(enrollInputSchema.safeParse({ ...base, consent: true }).success).toBe(true);
    expect(enrollInputSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(enrollInputSchema.safeParse(base).success).toBe(false); // missing consent
  });
});
