import type { TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

/**
 * Textarea (UX-03) — mirrors the Input token treatment (hairline border, brand focus ring, `invalid`
 * pairs colour with state for non-colour-only signalling).
 */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex min-h-20 w-full rounded-vq border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi',
        'placeholder:text-vq-text-lo transition-colors duration-[120ms] ease-[var(--ease-out-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid
          ? 'border-vq-danger focus-visible:ring-vq-danger'
          : 'border-vq-border focus-visible:border-vq-violet/60 focus-visible:ring-vq-ring',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
