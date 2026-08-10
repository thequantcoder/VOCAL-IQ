'use client';

import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import { LegendItem, VIZ_COLORS } from './chart-tooltip';
import { useWidth } from './use-width';

/**
 * StackedBar (UX-09b) — one stacked bar per category, each split into keyed segments (e.g. outcomes per
 * day). Shares a max across categories so heights compare. Legend + grow-in. Zero-dep, reduced-motion →
 * static.
 */
export interface StackedDatum {
  label: string;
  /** Segment key → value. */
  values: Record<string, number>;
}

export function StackedBar({
  data,
  keys,
  height = 200,
  colors,
  className,
  label,
}: {
  data: StackedDatum[];
  keys: string[];
  height?: number;
  colors?: Record<string, string>;
  className?: string;
  label?: string;
}) {
  const { animate } = useMotionLevel();
  const [ref, width] = useWidth();

  if (data.length === 0) {
    return (
      <div
        ref={ref}
        className={cn('grid h-48 place-items-center text-sm text-vq-text-lo', className)}
      >
        No data yet.
      </div>
    );
  }

  const labelH = 18;
  const chartH = height - labelH;
  const totals = data.map((d) => keys.reduce((s, k) => s + (d.values[k] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const gap = 8;
  const barW = Math.max(3, (width - gap * (data.length - 1)) / data.length);
  const colorOf = (k: string, i: number) => colors?.[k] ?? VIZ_COLORS[i % VIZ_COLORS.length];

  return (
    <div ref={ref} className={cn('w-full', className)}>
      <svg width={width} height={height} role="img" aria-label={label ?? 'Stacked bar chart'}>
        <title>{label ?? 'Stacked bar chart'}</title>
        {data.map((d, di) => {
          const x = di * (barW + gap);
          let y = chartH;
          return (
            <g key={d.label}>
              {keys.map((k, ki) => {
                const v = d.values[k] ?? 0;
                const h = (v / max) * (chartH - 2);
                y -= h;
                return (
                  <rect
                    key={k}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(0, h)}
                    fill={colorOf(k, ki)}
                    className={
                      animate ? 'motion-safe:animate-[vq-fade-in_500ms_ease_backwards]' : undefined
                    }
                    style={animate ? { animationDelay: `${di * 40}ms` } : undefined}
                  >
                    <title>{`${d.label} · ${k}: ${v.toLocaleString()}`}</title>
                  </rect>
                );
              })}
              {data.length <= 16 && (
                <text
                  x={x + barW / 2}
                  y={height - 5}
                  textAnchor="middle"
                  className="fill-vq-text-lo text-[9px]"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {keys.map((k, ki) => (
          <LegendItem key={k} color={colorOf(k, ki) as string} label={k} />
        ))}
      </div>
    </div>
  );
}
