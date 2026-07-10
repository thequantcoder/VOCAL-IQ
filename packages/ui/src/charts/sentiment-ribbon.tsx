import { cn } from '../lib/cn';

/**
 * SentimentRibbon (UX-09b) — a horizontal timeline ribbon coloured by sentiment over a sequence of
 * moments (e.g. per-segment call sentiment). Positive → green, neutral → grey, negative → red, tinted by
 * magnitude. Native `<title>` per cell. Zero-dep, no motion needed.
 */
export interface SentimentPoint {
  /** -1 (very negative) … 0 (neutral) … 1 (very positive). */
  score: number;
  label?: string;
}

function toneColor(score: number): string {
  if (score > 0.15) return 'var(--success)';
  if (score < -0.15) return 'var(--danger)';
  return 'var(--neutral-400)';
}

export function SentimentRibbon({
  points,
  height = 14,
  className,
  label,
}: {
  points: SentimentPoint[];
  height?: number;
  className?: string;
  label?: string;
}) {
  if (points.length === 0) {
    return <div className={cn('text-sm text-vq-text-lo', className)}>No sentiment yet.</div>;
  }
  return (
    <div
      className={cn('flex w-full gap-px overflow-hidden rounded-vq-pill', className)}
      style={{ height }}
      role="img"
      aria-label={label ?? 'Sentiment timeline'}
    >
      {points.map((p, i) => (
        <div
          key={p.label ?? i}
          className="flex-1"
          style={{
            background: toneColor(p.score),
            opacity: 0.35 + Math.min(1, Math.abs(p.score)) * 0.65,
          }}
          title={p.label ? `${p.label}: ${p.score.toFixed(2)}` : `${p.score.toFixed(2)}`}
        />
      ))}
    </div>
  );
}
