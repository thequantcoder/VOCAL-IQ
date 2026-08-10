import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * ChartTooltip (UX-09b) — a small floating readout positioned by pixel coords within a `relative` chart
 * wrapper. Shared across the interactive charts. Purely presentational; the parent owns hover state.
 */
export function ChartTooltip({
  x,
  y,
  children,
  className,
}: {
  x: number;
  y: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-vq-sm border border-vq-border bg-vq-bg-overlay px-2 py-1 text-vq-text-hi text-xs shadow-elev-2',
        className,
      )}
      style={{ left: x, top: y - 8 }}
      // biome-ignore lint/a11y/useSemanticElements: a transient chart readout is a live status region, not an <output> form control.
      role="status"
    >
      {children}
    </div>
  );
}

/** A small legend row (swatch + label) reused by donut / stacked / multi-line charts. */
export function LegendItem({ color, label }: { color: string; label: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-vq-text-lo text-xs">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

/** The categorical viz palette (UX-02 tokens) — cycle through for series/segments. */
export const VIZ_COLORS = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
  'var(--viz-7)',
  'var(--viz-8)',
];
