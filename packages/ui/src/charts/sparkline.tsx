'use client';

import { useId } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import { areaPath, linePath, toPoints } from './geometry';

/**
 * Sparkline (UX-09) — an inline trend line (+ optional gradient area) for tables, stat cards, and KPIs.
 * Zero-dep SVG, themed to a viz token, animated draw-in via a length-independent `pathLength` trick
 * (static under reduced motion). A trailing dot marks the latest point.
 */
export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** CSS color (defaults to the primary token). Pass a `--viz-n` for categorical series. */
  color?: string;
  area?: boolean;
  className?: string;
  label?: string;
}

export function Sparkline({
  data,
  width = 96,
  height = 28,
  color = 'var(--primary-500)',
  area = true,
  className,
  label,
}: SparklineProps) {
  const { animate } = useMotionLevel();
  const gid = useId();
  const points = toPoints(data, width, height, 2);
  const last = points[points.length - 1];

  if (points.length === 0) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={areaPath(points, height)} fill={`url(#spark-${gid})`} stroke="none" />}
      <path
        d={linePath(points)}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className={
          animate
            ? '[stroke-dasharray:1] [stroke-dashoffset:1] motion-safe:animate-[vq-draw_800ms_var(--ease-out-soft)_forwards]'
            : undefined
        }
      />
      {last && <circle cx={last.x} cy={last.y} r={2} fill={color} />}
    </svg>
  );
}
