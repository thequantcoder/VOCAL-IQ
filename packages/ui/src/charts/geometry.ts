/**
 * Shared chart geometry helpers (UX-09) — pure, tested-by-use maths for the zero-dep SVG viz kit.
 * No React, no DOM: normalise a series into an SVG path within a viewBox.
 */

/** Map a value series to [0..width] × [0..height] SVG points (y flipped so up = larger). */
export function toPoints(
  data: number[],
  width: number,
  height: number,
  pad = 2,
): Array<{ x: number; y: number }> {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  return data.map((v, i) => ({
    x: pad + i * step,
    y: pad + innerH - ((v - min) / span) * innerH,
  }));
}

/** A smooth-ish polyline `d` (straight segments — crisp + cheap). */
export function linePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

/** Close a line into a filled area down to the baseline. */
export function areaPath(points: Array<{ x: number; y: number }>, height: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  return `${linePath(points)} L ${last.x.toFixed(2)} ${height} L ${first.x.toFixed(2)} ${height} Z`;
}
