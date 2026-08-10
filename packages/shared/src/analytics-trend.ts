/**
 * Analytics trend tiles (FOLLOWUP) — pure aggregation of a daily series into a "last N days vs the
 * previous N days" delta, for the weekly/monthly trend tiles. No I/O; unit-tested.
 */

export interface TrendDelta {
  /** Sum over the most recent `windowDays`. */
  recent: number;
  /** Sum over the `windowDays` immediately before that. */
  previous: number;
  /** Percent change recent-vs-previous, or null when there is no prior window to compare against. */
  deltaPct: number | null;
}

/**
 * Split a chronological daily series into the last `windowDays` and the `windowDays` before it, and
 * return the two sums + the percent delta. `deltaPct` is null when there's no prior window (too few
 * points) or the prior window is zero (can't compute a percentage).
 */
export function windowedTrend(points: { value: number }[], windowDays: number): TrendDelta {
  const w = Math.max(1, Math.floor(windowDays));
  const n = points.length;
  const sum = (arr: { value: number }[]) => arr.reduce((s, p) => s + (p.value || 0), 0);
  const recent = sum(points.slice(Math.max(0, n - w)));
  const priorSlice = points.slice(Math.max(0, n - 2 * w), Math.max(0, n - w));
  const previous = sum(priorSlice);
  const deltaPct =
    priorSlice.length === 0 || previous === 0
      ? null
      : Math.round(((recent - previous) / previous) * 100);
  return { recent, previous, deltaPct };
}
