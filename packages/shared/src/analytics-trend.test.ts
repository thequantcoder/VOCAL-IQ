import { describe, expect, it } from 'vitest';
import { windowedTrend } from './analytics-trend.js';

const pts = (vals: number[]) => vals.map((value) => ({ value }));

describe('windowedTrend', () => {
  it('sums the last window vs the prior window and computes the delta', () => {
    // 4 days: prior [10,10]=20, recent [15,15]=30 → +50%.
    const t = windowedTrend(pts([10, 10, 15, 15]), 2);
    expect(t.recent).toBe(30);
    expect(t.previous).toBe(20);
    expect(t.deltaPct).toBe(50);
  });

  it('returns a null delta when there is no prior window', () => {
    const t = windowedTrend(pts([5, 5]), 7); // fewer than 2×7 points, no prior
    expect(t.recent).toBe(10);
    expect(t.previous).toBe(0);
    expect(t.deltaPct).toBeNull();
  });

  it('returns a null delta when the prior window is zero (can’t divide)', () => {
    const t = windowedTrend(pts([0, 0, 4, 6]), 2);
    expect(t.recent).toBe(10);
    expect(t.previous).toBe(0);
    expect(t.deltaPct).toBeNull();
  });

  it('handles a negative delta', () => {
    const t = windowedTrend(pts([20, 20, 10, 10]), 2); // prior 40 → recent 20 = -50%
    expect(t.deltaPct).toBe(-50);
  });
});
