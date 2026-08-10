import { cn } from '../lib/cn';

/**
 * TrendDelta (UX-09) — a coloured ▲/▼ change vs a previous period. Positive is success-green by default;
 * pass `invert` for metrics where down is good (cost, latency, churn). Pure presentational, no motion.
 */
export interface TrendDeltaProps {
  /** Percent change (e.g. 12.5 for +12.5%). */
  value: number;
  /** Down-is-good metrics (cost, latency) → green when negative. */
  invert?: boolean;
  className?: string;
}

export function TrendDelta({ value, invert = false, className }: TrendDeltaProps) {
  const up = value > 0;
  const flat = Math.abs(value) < 0.05;
  const good = flat ? null : invert ? !up : up;
  const tone = good == null ? 'text-vq-text-lo' : good ? 'text-success' : 'text-danger';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium text-xs tabular-nums',
        tone,
        className,
      )}
    >
      <span aria-hidden="true">{flat ? '→' : up ? '▲' : '▼'}</span>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
