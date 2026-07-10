'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import { LegendItem, VIZ_COLORS } from './chart-tooltip';

/**
 * DonutBreakdown (UX-09b) — a proportional donut (call outcomes, spend split) with a centre total, a
 * legend, hover emphasis, and an animated sweep-in. Zero-dep SVG, reduced-motion → static.
 */
export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export function DonutBreakdown({
  data,
  size = 168,
  thickness = 22,
  centerLabel,
  format = (v: number) => v.toLocaleString(),
  className,
}: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const { animate } = useMotionLevel();
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  if (total === 0) {
    return (
      <div className={cn('grid h-44 place-items-center text-sm text-vq-text-lo', className)}>
        No data yet.
      </div>
    );
  }

  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Breakdown">
          <title>Breakdown</title>
          {data.map((d, i) => {
            const frac = d.value / total;
            const len = frac * c;
            const color = d.color ?? VIZ_COLORS[i % VIZ_COLORS.length];
            const dash = `${len} ${c - len}`;
            const seg = (
              <circle
                key={d.label}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={hover === i ? thickness + 4 : thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                className={cn(
                  'transition-[stroke-width]',
                  animate && 'motion-safe:animate-[vq-fade-in_600ms_ease_backwards]',
                )}
                style={animate ? { animationDelay: `${i * 90}ms` } : undefined}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="flex flex-col">
            <span className="font-display font-semibold text-vq-text-hi text-xl">
              {hover != null ? format(data[hover]?.value ?? 0) : format(total)}
            </span>
            <span className="text-vq-text-lo text-xs">
              {hover != null ? data[hover]?.label : (centerLabel ?? 'Total')}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <LegendItem
            key={d.label}
            color={d.color ?? (VIZ_COLORS[i % VIZ_COLORS.length] as string)}
            label={
              <span>
                {d.label}{' '}
                <span className="text-vq-text-hi">{Math.round((d.value / total) * 100)}%</span>
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}
