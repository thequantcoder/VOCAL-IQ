'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import { ChartTooltip } from './chart-tooltip';
import { useWidth } from './use-width';

/**
 * BarSeries (UX-09b) — a categorical bar chart with grow-in animation, hover highlight + tooltip, and
 * optional x labels. Zero-dep SVG, responsive, reduced-motion → static. Themeable to any `--viz-n`.
 */
export interface BarDatum {
  label: string;
  value: number;
}

export function BarSeries({
  data,
  height = 180,
  color = 'var(--viz-2)',
  format = (v: number) => v.toLocaleString(),
  className,
  label,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
  className?: string;
  label?: string;
}) {
  const { animate } = useMotionLevel();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        ref={ref}
        className={cn('grid h-44 place-items-center text-sm text-vq-text-lo', className)}
      >
        No data yet.
      </div>
    );
  }

  const labelH = 18;
  const chartH = height - labelH;
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = 6;
  const barW = Math.max(2, (width - gap * (data.length - 1)) / data.length);

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <svg width={width} height={height} role="img" aria-label={label ?? 'Bar chart'}>
        <title>{label ?? 'Bar chart'}</title>
        {data.map((d, i) => {
          const h = (d.value / max) * (chartH - 4);
          const x = i * (barW + gap);
          const y = chartH - h;
          const active = hover === i;
          return (
            <g
              key={d.label}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              {/* full-height hit target */}
              <rect x={x} y={0} width={barW} height={chartH} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                fill={color}
                opacity={hover == null || active ? 1 : 0.5}
                className={cn(
                  'origin-bottom transition-opacity',
                  animate &&
                    'motion-safe:animate-[vq-bar-grow_600ms_var(--ease-out-soft)_backwards]',
                )}
                style={animate ? { animationDelay: `${i * 40}ms` } : undefined}
              />
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
      {hover != null && data[hover] && (
        <ChartTooltip
          x={hover * (barW + gap) + barW / 2}
          y={chartH - (data[hover].value / max) * (chartH - 4)}
        >
          <span className="text-vq-text-lo">{data[hover].label}: </span>
          <span className="font-medium">{format(data[hover].value)}</span>
        </ChartTooltip>
      )}
    </div>
  );
}
