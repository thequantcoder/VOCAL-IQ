'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '../lib/cn';

/**
 * Checkbox (UX-03) — Radix Checkbox with a draw-in tick (SVG stroke-dashoffset animates when checked,
 * static under reduced-motion). Supports the indeterminate state. Fills with the primary token.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer grid size-5 shrink-0 place-items-center rounded-vq-sm border border-vq-border bg-vq-bg-base',
        'transition-colors duration-150 ease-[var(--ease-out-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary-500 data-[state=checked]:bg-primary-500',
        'data-[state=indeterminate]:border-primary-500 data-[state=indeterminate]:bg-primary-500',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-primary-fg">
        {props.checked === 'indeterminate' ? (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
            <path d="M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="[stroke-dasharray:18] [stroke-dashoffset:18] motion-safe:animate-[vq-check-draw_240ms_var(--ease-out-soft)_forwards] motion-reduce:[stroke-dashoffset:0]"
            />
          </svg>
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
