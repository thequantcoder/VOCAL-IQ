'use client';

import { cn } from '../lib/cn';

/**
 * Progress (UX-03) — linear + circular, animated via CSS transitions (killed under motion-off). Reads
 * the primary token; `indeterminate` for unknown-length work.
 */

export function Progress({
  value,
  className,
  indeterminate,
  label,
}: {
  value?: number; // 0..100
  indeterminate?: boolean;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: progressbar is a non-interactive live region, not a focus target.
    <div
      className={cn('h-2 w-full overflow-hidden rounded-vq-pill bg-neutral-500/15', className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          'h-full rounded-vq-pill bg-primary-500 transition-[width] duration-500 ease-[var(--ease-out-soft)]',
          indeterminate && 'vq-skeleton w-1/3',
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}

/** Circular progress ring — for compact KPIs/gauges (a fuller RadialGauge lands in UX-09). */
export function CircularProgress({
  value = 0,
  size = 40,
  stroke = 4,
  className,
  children,
}: {
  value?: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-neutral-500/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary-500 transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-soft)] motion-reduce:transition-none"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      {children && <span className="absolute font-medium text-vq-text-hi text-xs">{children}</span>}
    </div>
  );
}
