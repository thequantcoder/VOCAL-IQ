import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

/*
 * Re-skinned to the VocalIQ identity (DESIGN-SYSTEM §8) — not a shadcn default.
 * Violet is the brand CTA (§1); micro press-scale + focus ring grow (§4). Quiet
 * surfaces for secondary/ghost so one bold CTA leads each screen.
 */
const base =
  'inline-flex items-center justify-center gap-2 rounded-vq font-medium whitespace-nowrap ' +
  'transition-[transform,background-color,border-color,color] duration-[120ms] ease-[var(--ease-out-soft)] ' +
  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base ' +
  'disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-vq-violet text-white hover:bg-vq-violet-deep',
  secondary: 'bg-vq-bg-elevated text-vq-text-hi border border-vq-border hover:border-vq-violet/60',
  ghost: 'bg-transparent text-vq-text-hi hover:bg-vq-bg-elevated',
  danger: 'bg-vq-danger text-white hover:opacity-90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', type = 'button', className, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
