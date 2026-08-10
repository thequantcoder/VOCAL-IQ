import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Async in-flight: shows a spinner, hides the label (width held), disables + aria-busy. */
  loading?: boolean;
  /** Just-completed: draws a checkmark before the label (fades back after the caller clears it). */
  success?: boolean;
  children?: ReactNode;
}

/*
 * Re-skinned to the VocalIQ identity (DESIGN-SYSTEM §8) — not a shadcn default.
 * Violet is the brand CTA (§1); micro press-scale + focus ring grow (§4). Quiet
 * surfaces for secondary/ghost so one bold CTA leads each screen. UX-08 adds a
 * hover sheen + loading/success states (all CSS, so Button stays a server-safe
 * component — no client boundary). JS-driven effects live in MagneticButton.
 */
const base =
  'relative inline-flex items-center justify-center gap-2 rounded-vq font-medium whitespace-nowrap ' +
  'transition-[transform,background-color,border-color,color] duration-[120ms] ease-[var(--ease-out-soft)] ' +
  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base ' +
  'disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100';

const variants: Record<ButtonVariant, string> = {
  // The bold CTAs get the hover sheen (vq-btn-sheen adds overflow-hidden + a sweep pseudo-element).
  primary: 'vq-btn-sheen bg-vq-violet text-white hover:bg-vq-violet-deep',
  secondary: 'bg-vq-bg-elevated text-vq-text-hi border border-vq-border hover:border-vq-violet/60',
  ghost: 'bg-transparent text-vq-text-hi hover:bg-vq-bg-elevated',
  danger: 'vq-btn-sheen bg-vq-danger text-white hover:opacity-90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/** Shared class string for the fancy/JS button variants (MagneticButton) so styling stays identical. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 animate-spin motion-reduce:animate-none"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckDraw() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="[stroke-dasharray:18] [stroke-dashoffset:18] motion-safe:animate-[vq-check-draw_240ms_var(--ease-out-soft)_forwards] motion-reduce:[stroke-dashoffset:0]"
      />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      type = 'button',
      className,
      loading = false,
      success = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
      <span className={cn('inline-flex items-center gap-2', loading && 'opacity-0')}>
        {success && !loading && <CheckDraw />}
        {children}
      </span>
    </button>
  ),
);
Button.displayName = 'Button';
