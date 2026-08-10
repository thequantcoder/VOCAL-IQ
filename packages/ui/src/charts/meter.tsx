'use client';

import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * Meter / Bullet (UX-09) — a linear "value vs limit" bar (usage vs quota, budget vs cap). Fills with an
 * eased transition (static under reduced motion) and turns amber/red as it nears/exceeds the limit;
 * an optional `target` tick marks a goal. Zero-dep.
 */
export interface MeterProps {
  value: number;
  max: number;
  /** Optional goal marker (same unit as value). */
  target?: number;
  label?: string;
  /** Show the "value / max" caption. */
  showValue?: boolean;
  className?: string;
}

function zoneColor(ratio: number): string {
  if (ratio >= 1) return 'bg-danger';
  if (ratio >= 0.85) return 'bg-warn';
  return 'bg-primary-500';
}

export function Meter({ value, max, target, label, showValue = true, className }: MeterProps) {
  const { animate } = useMotionLevel();
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.max(0, Math.min(100, ratio * 100));
  const targetPct =
    target != null && max > 0 ? Math.max(0, Math.min(100, (target / max) * 100)) : null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-vq-text-lo">{label}</span>}
          {showValue && (
            <span className="font-mono text-vq-text-hi tabular-nums">
              {value.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div
        className="relative h-2 w-full overflow-hidden rounded-vq-pill bg-neutral-500/15"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-vq-pill',
            zoneColor(ratio),
            animate && 'transition-[width] duration-700 ease-[var(--ease-out-soft)]',
          )}
          style={{ width: `${pct}%` }}
        />
        {targetPct != null && (
          <span
            className="absolute inset-y-0 w-0.5 bg-vq-text-hi/60"
            style={{ left: `${targetPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
