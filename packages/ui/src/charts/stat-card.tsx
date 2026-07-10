'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { AnimatedNumber } from '../motion/animated-number';
import { Sparkline } from './sparkline';
import { TrendDelta } from './trend-delta';

/**
 * StatCard v2 (UX-09) — a KPI tile: a label, an `<AnimatedNumber>` count-up value, an optional trend
 * delta vs last period, an optional sparkline, and a subtle sentiment glow (good → cyan, bad → amber)
 * so a screen of numbers reads at a glance. Zero-dep, reduced-motion-safe (count-up + spark degrade).
 */
export type StatSentiment = 'good' | 'bad' | 'neutral';

export interface StatCardProps {
  label: ReactNode;
  value: number;
  /** Format the value (e.g. currency, %). */
  format?: (v: number) => string;
  icon?: ReactNode;
  /** Percent change vs the previous period. */
  delta?: number;
  deltaInvert?: boolean;
  /** Trend series for the inline sparkline. */
  spark?: number[];
  sentiment?: StatSentiment;
  className?: string;
}

const glow: Record<StatSentiment, string> = {
  good: 'before:from-success/12',
  bad: 'before:from-warn/14',
  neutral: 'before:from-primary-500/8',
};

const sparkColor: Record<StatSentiment, string> = {
  good: 'var(--success)',
  bad: 'var(--warn)',
  neutral: 'var(--primary-500)',
};

export function StatCard({
  label,
  value,
  format,
  icon,
  delta,
  deltaInvert,
  spark,
  sentiment = 'neutral',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-vq-card border border-vq-border bg-vq-bg-elevated p-4',
        // Sentiment glow — a soft gradient wash behind the content.
        'before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:to-transparent',
        glow[sentiment],
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm text-vq-text-lo">
          {icon}
          {label}
        </span>
        {delta != null && <TrendDelta value={delta} invert={deltaInvert ?? false} />}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="font-display font-semibold text-3xl text-vq-text-hi tabular-nums">
          <AnimatedNumber value={value} {...(format ? { format } : {})} />
        </span>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} color={sparkColor[sentiment]} width={84} height={30} />
        )}
      </div>
    </div>
  );
}
