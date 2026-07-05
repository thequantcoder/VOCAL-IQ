import { describe, expect, it } from 'vitest';
import { READINESS_CHECKLIST, evaluateReadiness } from './launch-readiness.js';

/** Build a signals map where every listed key passes; others default to failed. */
function allPass(): Record<string, { passed: boolean }> {
  return Object.fromEntries(READINESS_CHECKLIST.map((i) => [i.key, { passed: true }]));
}

describe('evaluateReadiness (the go-live gate)', () => {
  it('is GO when every blocker passes', () => {
    const r = evaluateReadiness(allPass());
    expect(r.go).toBe(true);
    expect(r.blockersFailed).toBe(0);
    expect(r.passed).toBe(r.total);
  });

  it('is NO-GO when a blocker fails', () => {
    const signals = allPass();
    signals['reliability.db'] = { passed: false };
    const r = evaluateReadiness(signals);
    expect(r.go).toBe(false);
    expect(r.blockersFailed).toBe(1);
  });

  it('stays GO when only warnings fail (advisory)', () => {
    const signals = allPass();
    signals['security.cors'] = { passed: false }; // a warning
    signals['scale.region'] = { passed: false }; // a warning
    const r = evaluateReadiness(signals);
    expect(r.go).toBe(true);
    expect(r.warningsFailed).toBe(2);
  });

  it('fails closed for a missing signal (a check you did not run)', () => {
    const r = evaluateReadiness({}); // no signals at all
    expect(r.go).toBe(false);
    expect(r.blockersFailed).toBeGreaterThan(0);
    expect(r.passed).toBe(0);
  });
});
