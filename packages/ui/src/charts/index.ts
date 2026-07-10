/**
 * @vocaliq/ui/charts — the zero-dep, themed, animated data-viz kit (UX-09). Pure SVG (no Recharts) so it
 * stays off the shared bundle and matches the existing chart approach; every piece reads the UX-02 viz
 * tokens and is reduced-motion-safe. Bigger charts (area/line/bar/donut/heatmap) land in UX-09b.
 */
export { Sparkline, type SparklineProps } from './sparkline';
export { RadialGauge, type RadialGaugeProps } from './radial-gauge';
export { Meter, type MeterProps } from './meter';
export { TrendDelta, type TrendDeltaProps } from './trend-delta';
export { StatCard, type StatCardProps, type StatSentiment } from './stat-card';
export { toPoints, linePath, areaPath } from './geometry';
