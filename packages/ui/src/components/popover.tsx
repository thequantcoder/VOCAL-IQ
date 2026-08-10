'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../lib/cn';

/** Popover (UX-03) — Radix a11y + our tokens. `Popover` / `PopoverTrigger` / `PopoverContent`. */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-vq-card border border-vq-border bg-vq-bg-overlay p-3 text-vq-text-hi shadow-elev-3 outline-none',
          'data-[state=open]:animate-[vq-pop-in_160ms_var(--ease-out-soft)] data-[state=closed]:animate-[vq-pop-out_120ms_ease]',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
