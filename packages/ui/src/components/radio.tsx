'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '../lib/cn';

/**
 * RadioGroup (UX-03) — Radix RadioGroup (roving-focus, arrow keys). The inner dot pops in with a scale
 * transition (killed under reduced-motion). Ring + dot use the primary token.
 */
export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} />;
}

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'grid size-5 place-items-center rounded-full border border-vq-border bg-vq-bg-base',
        'transition-colors duration-150 ease-[var(--ease-out-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base',
        'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary-500',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-primary-500 motion-safe:animate-[vq-pop-in_180ms_var(--ease-emphasized)]" />
    </RadioGroupPrimitive.Item>
  );
}
