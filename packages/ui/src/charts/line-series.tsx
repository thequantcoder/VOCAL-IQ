'use client';

import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import { LegendItem, VIZ_COLORS } from './chart-tooltip';
import { linePath } from './geometry';
import { useWidth } from './use-width';

/**
 * LineSeries (UX-09b) — a multi-series line chart with a legend and animated draw-in. All series share
 * one min/max so they're comparable. Zero-dep SVG, responsive, reduced-motion → static.
 */
export interface Series {
  label: string;
  data: number[];
  color?: string;
}

export function LineSeries({
  series,
  height = 200,
  className,
  label,
}: {
  series: Series[];
  height?: number;
  className?: string;
  label?: string;
}) {
  const { animate } = useMotionLevel();
  const [ref, width] = useWidth();
  const all = series.flatMap((s) => s.data);

  if (all.length === 0) {
    return (
      <div
        ref={ref}
        className={cn('grid h-48 place-items-center text-sm text-vq-text-lo', className)}
      >
        No data yet.
      </div>
    );
  }

  const min = Math.min(...all);
  const max = Math.max(...all);
  const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));
  const pad = 4;
  const chartH = height - 24; // room for legend

  return (
    <div ref={ref} className={cn('w-full', className)}>
      <svg width={width} height={chartH} role="img" aria-label={label ?? 'Line chart'}>
        <title>{label ?? 'Line chart'}</title>
        {series.map((s, si) => {
          const color = s.color ?? VIZ_COLORS[si % VIZ_COLORS.length];
          // Map each point using the shared min/max (not per-series).
          const pts = s.data.map((v, i) => ({
            x: pad + (s.data.length > 1 ? (i / (s.data.length - 1)) * (width - pad * 2) : 0),
            y: pad + (1 - norm(v)) * (chartH - pad * 2),
          }));
          return (
            <path
              key={s.label}
              d={linePath(pts)}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className={
                animate
                  ? '[stroke-dasharray:1] [stroke-dashoffset:1] motion-safe:animate-[vq-draw_900ms_var(--ease-out-soft)_forwards]'
                  : undefined
              }
              style={animate ? { animationDelay: `${si * 120}ms` } : undefined}
            />
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s, si) => (
          <LegendItem
            key={s.label}
            color={s.color ?? (VIZ_COLORS[si % VIZ_COLORS.length] as string)}
            label={s.label}
          />
        ))}
      </div>
    </div>
  );
}
