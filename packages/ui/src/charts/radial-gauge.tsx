'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * RadialGauge (UX-09) — a 270° arc gauge for a single 0–100 metric (success rate, sentiment, health).
 * The arc sweeps to the value with an eased transition (static under reduced motion) and colours by
 * threshold (danger → warn → success) unless a fixed `color` is given. Zero-dep SVG.
 */
export interface RadialGaugeProps {
  /** 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  /** Fixed arc colour (overrides the threshold colouring). */
  color?: string;
  label?: string;
  children?: ReactNode;
  className?: string;
}

function thresholdColor(v: number): string {
  if (v >= 75) return 'var(--success)';
  if (v >= 45) return 'var(--warn)';
  return 'var(--danger)';
}

export function RadialGauge({
  value,
  size = 120,
  stroke = 10,
  color,
  label,
  children,
  className,
}: RadialGaugeProps) {
  const { animate } = useMotionLevel();
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // 270° arc (gap at the bottom). Full arc length = 0.75 of the circumference.
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;
  const dash = (pct / 100) * arc;
  const arcColor = color ?? thresholdColor(pct);

  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ? `${label}: ${Math.round(pct)}%` : `${Math.round(pct)}%`}
    >
      <svg width={size} height={size} className="-rotate-[135deg]" aria-hidden="true">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-neutral-500/20"
          strokeDasharray={`${arc} ${circumference}`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={arcColor}
          strokeDasharray={`${dash} ${circumference}`}
          className={
            animate
              ? 'transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-soft)]'
              : undefined
          }
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children ?? (
          <span className="font-display font-semibold text-vq-text-hi text-xl">
            {Math.round(pct)}%
          </span>
        )}
      </div>
    </div>
  );
}
