'use client';

import { useId, useState } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import { ChartTooltip } from './chart-tooltip';
import { areaPath, linePath, toPoints } from './geometry';
import { useWidth } from './use-width';

/**
 * AreaTrend (UX-09b) — a single-series area+line chart with a gradient fill, animated draw-in, a hover
 * crosshair + tooltip, and an empty state. Zero-dep SVG, responsive (ResizeObserver), reduced-motion →
 * static. Themeable to any `--viz-n`.
 */
export interface AreaTrendProps {
  data: number[];
  labels?: string[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
  className?: string;
  label?: string;
}

export function AreaTrend({
  data,
  labels,
  height = 180,
  color = 'var(--viz-1)',
  format = (v) => v.toLocaleString(),
  className,
  label,
}: AreaTrendProps) {
  const { animate } = useMotionLevel();
  const gid = useId();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = 4;
  const points = toPoints(data, width, height, pad);

  if (points.length === 0) {
    return (
      <div
        ref={ref}
        className={cn('grid h-44 place-items-center text-sm text-vq-text-lo', className)}
      >
        No data yet.
      </div>
    );
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * (data.length - 1);
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel))));
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label ? `${label} trend` : 'Trend'}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <title>{label ?? 'Trend'}</title>
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath(points, height)} fill={`url(#area-${gid})`} />
        <path
          d={linePath(points)}
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
        />
        {hp && (
          <g>
            <line
              x1={hp.x}
              y1={0}
              x2={hp.x}
              y2={height}
              stroke="var(--vq-border)"
              strokeWidth={1}
            />
            <circle
              cx={hp.x}
              cy={hp.y}
              r={4}
              fill={color}
              stroke="var(--surface-0, #fff)"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
      {hp && hover != null && (
        <ChartTooltip x={hp.x} y={hp.y}>
          <span className="font-medium">{format(data[hover] ?? 0)}</span>
          {labels?.[hover] && <span className="ml-1 text-vq-text-lo">{labels[hover]}</span>}
        </ChartTooltip>
      )}
    </div>
  );
}
