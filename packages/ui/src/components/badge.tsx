import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Badge + Chip (UX-03). Token-driven status pills. `Badge` is a static label; `Chip` is a removable
 * tag (X button). Semantic variants read the UX-02 tokens so they re-skin with the theme.
 */

export type BadgeVariant =
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warn'
  | 'danger'
  | 'info'
  | 'outline';

const badgeVariants: Record<BadgeVariant, string> = {
  neutral: 'bg-neutral-500/12 text-vq-text-hi',
  primary: 'bg-primary-500/15 text-primary-500',
  accent: 'bg-accent-500/15 text-accent-700 dark:text-accent-300',
  success: 'bg-success-subtle text-success',
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  outline: 'border border-vq-border text-vq-text-lo',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children?: ReactNode;
}

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-vq-pill px-2 py-0.5 font-medium text-xs',
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'onRemove'> {
  variant?: BadgeVariant;
  onRemove?: () => void;
  children?: ReactNode;
}

export function Chip({ variant = 'neutral', onRemove, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-vq-pill px-2.5 py-1 text-xs',
        badgeVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="-mr-1 ml-0.5 grid size-4 place-items-center rounded-full text-current/70 transition-colors hover:bg-black/10 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring dark:hover:bg-white/15"
        >
          <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true" fill="none">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
