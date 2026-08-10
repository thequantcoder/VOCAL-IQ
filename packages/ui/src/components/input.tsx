import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

/*
 * Re-skinned input (DESIGN-SYSTEM §8): hairline border, focus ring grows to the
 * brand violet (§4). `invalid` pairs colour with state for non-colour-only
 * signalling later (a11y, §7). Numeric/data inputs can opt into the mono face.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, mono = false, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-10 w-full rounded-vq border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi',
        'placeholder:text-vq-text-lo transition-colors duration-[120ms] ease-[var(--ease-out-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-vq-bg-base disabled:cursor-not-allowed disabled:opacity-50',
        invalid
          ? 'border-vq-danger focus-visible:ring-vq-danger'
          : 'border-vq-border focus-visible:ring-vq-ring focus-visible:border-vq-violet/60',
        mono && 'font-mono',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
