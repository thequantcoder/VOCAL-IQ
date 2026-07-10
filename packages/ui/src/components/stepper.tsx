'use client';

import { cn } from '../lib/cn';

/**
 * Stepper (UX-03) — a horizontal progress indicator for multi-step flows (onboarding lands in UX-14).
 * Steps render as done / current / upcoming; the connector fills with the primary token as you advance.
 * `current` is the zero-based index of the active step.
 */
export interface Step {
  label: React.ReactNode;
  hint?: React.ReactNode;
}

export function Stepper({
  steps,
  current,
  className,
}: {
  steps: Step[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn('flex w-full items-start', className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const last = i === steps.length - 1;
        return (
          <li
            key={i === current ? `cur-${i}` : `${i}`}
            className={cn('flex flex-1 items-start', last && 'flex-none')}
            aria-current={active ? 'step' : undefined}
          >
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-full border-2 font-medium text-sm transition-colors duration-200',
                  done && 'border-primary-500 bg-primary-500 text-primary-fg',
                  active &&
                    'border-primary-500 text-primary-500 motion-safe:animate-[vq-pop-in_220ms_var(--ease-emphasized)]',
                  !done && !active && 'border-vq-border text-vq-text-lo',
                )}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none">
                    <path
                      d="M3.5 8.5l3 3 6-6.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="flex flex-col items-center text-center">
                <span
                  className={cn(
                    'font-medium text-xs',
                    active || done ? 'text-vq-text-hi' : 'text-vq-text-lo',
                  )}
                >
                  {step.label}
                </span>
                {step.hint && <span className="text-[0.7rem] text-vq-text-lo">{step.hint}</span>}
              </span>
            </div>
            {!last && (
              <span className="mx-2 mt-4 h-0.5 flex-1 overflow-hidden rounded-vq-pill bg-neutral-500/25">
                <span
                  className="block h-full rounded-vq-pill bg-primary-500 transition-[width] duration-300 ease-[var(--ease-out-soft)]"
                  style={{ width: done ? '100%' : '0%' }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
