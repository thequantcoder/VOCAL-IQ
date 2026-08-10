import { describe, expect, it } from 'vitest';
import { computeOnboarding } from './onboarding.js';

const NONE = { hasAgent: false, hasNumber: false, hasCall: false, hasResults: false };

describe('computeOnboarding', () => {
  it('is 0% with a first-step CTA when nothing is done', () => {
    const p = computeOnboarding(NONE);
    expect(p.percent).toBe(0);
    expect(p.complete).toBe(false);
    expect(p.nextStep?.key).toBe('create_agent');
    expect(p.steps).toHaveLength(4);
  });

  it('advances the next step as signals flip', () => {
    const p = computeOnboarding({ ...NONE, hasAgent: true });
    expect(p.percent).toBe(25);
    expect(p.completedCount).toBe(1);
    expect(p.nextStep?.key).toBe('connect_number');
    expect(p.steps.find((s) => s.key === 'create_agent')?.done).toBe(true);
  });

  it('is 100% + complete with no next step when everything is done', () => {
    const p = computeOnboarding({
      hasAgent: true,
      hasNumber: true,
      hasCall: true,
      hasResults: true,
    });
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(true);
    expect(p.nextStep).toBeNull();
  });

  it('every step carries a label + destination href', () => {
    for (const s of computeOnboarding(NONE).steps) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.href).toMatch(/^\/dashboard/);
    }
  });
});
