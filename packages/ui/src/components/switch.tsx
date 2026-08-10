'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../lib/cn';

/**
 * Switch (UX-03) — Radix Switch (a11y: role=switch, keyboard). The thumb slides with a spring-ish CSS
 * transition (killed under reduced-motion); track flips to the primary token when checked.
 */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-vq-pill border-2 border-transparent',
        'transition-colors duration-200 ease-[var(--ease-out-soft)] motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary-500 data-[state=unchecked]:bg-neutral-500/30',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-elev-1 ring-0',
          'transition-transform duration-200 ease-[var(--ease-emphasized)] motion-reduce:transition-none',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
