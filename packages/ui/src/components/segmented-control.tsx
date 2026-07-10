'use client';

import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { m } from 'framer-motion';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * SegmentedControl (UX-03) — Radix ToggleGroup (single-select, roving focus, arrow keys) with a
 * framer `layoutId` pill that slides between the active option (killed under reduced-motion). A compact
 * alternative to Tabs/Radio for 2–4 mutually-exclusive choices.
 */
export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

export function SegmentedControl({
  options,
  value,
  onValueChange,
  className,
  'aria-label': ariaLabel,
}: {
  options: SegmentedOption[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const { animate } = useMotionLevel();
  const layoutId = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // ignore de-selection — a segmented control always has one active option
      onValueChange={(v) => v && onValueChange(v)}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-vq-pill border border-vq-border bg-vq-bg-base p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            className={cn(
              'relative rounded-vq-pill px-3 py-1.5 font-medium text-sm transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
              active ? 'text-primary-fg' : 'text-vq-text-lo hover:text-vq-text-hi',
            )}
          >
            {active && (
              <m.span
                {...(animate ? { layoutId } : {})}
                className="absolute inset-0 rounded-vq-pill bg-primary-500"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
