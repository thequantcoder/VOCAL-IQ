import { describe, expect, it } from 'vitest';
import { areaPath, linePath, toPoints } from './geometry';

/**
 * Pure SVG-geometry maths for the zero-dep chart kit (UX-09). These helpers back every sparkline /
 * line / area viz, so their invariants (padding, y-flip, degenerate inputs) are worth pinning.
 */

describe('toPoints', () => {
  it('returns [] for an empty series', () => {
    expect(toPoints([], 100, 40)).toEqual([]);
  });

  it('flips y so a larger value sits higher (smaller y) and honours padding', () => {
    const pts = toPoints([0, 10], 100, 40, 2);
    expect(pts).toHaveLength(2);
    // x spans the padded inner width: first at pad, last at width - pad.
    expect(pts[0]?.x).toBeCloseTo(2);
    expect(pts[1]?.x).toBeCloseTo(98);
    // min value → bottom (y = pad + innerH), max value → top (y = pad).
    expect(pts[0]?.y).toBeCloseTo(38); // 2 + 36
    expect(pts[1]?.y).toBeCloseTo(2);
  });

  it('places a single point at the left pad without dividing by zero', () => {
    // One point: step is 0 (x at the left pad) and span defaults to 1 → y at the baseline.
    const pts = toPoints([5], 100, 40, 2);
    expect(pts).toEqual([{ x: 2, y: 38 }]);
  });

  it('handles a flat series (zero span) without NaN — all points on one line', () => {
    const pts = toPoints([7, 7, 7], 100, 40, 2);
    expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    // span defaults to 1, so (v-min)/span = 0 → every y at the baseline.
    expect(pts.map((p) => p.y)).toEqual([38, 38, 38]);
  });
});

describe('linePath', () => {
  it('returns an empty string for no points', () => {
    expect(linePath([])).toBe('');
  });

  it('starts with M then L, at 2-decimal precision', () => {
    expect(
      linePath([
        { x: 1, y: 2 },
        { x: 3, y: 4.5 },
      ]),
    ).toBe('M 1.00 2.00 L 3.00 4.50');
  });
});

describe('areaPath', () => {
  it('returns an empty string for no points', () => {
    expect(areaPath([], 40)).toBe('');
  });

  it('closes the line down to the baseline (last → baseline → first → Z)', () => {
    const d = areaPath(
      [
        { x: 0, y: 10 },
        { x: 20, y: 5 },
      ],
      40,
    );
    expect(d).toBe('M 0.00 10.00 L 20.00 5.00 L 20.00 40 L 0.00 40 Z');
  });
});
