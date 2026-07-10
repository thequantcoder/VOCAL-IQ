'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '../lib/cn';

/**
 * Select (UX-03) — Radix Select (typeahead, keyboard, portal, collision-aware). Trigger mirrors the
 * Input token treatment; content animates in with the shared `data-[state]` keyframes. Re-exports the
 * primitive parts so callers compose <Select><SelectTrigger/><SelectContent>…items…</SelectContent>.
 */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi',
        'transition-colors duration-[120ms] ease-[var(--ease-out-soft)] data-[placeholder]:text-vq-text-lo',
        'focus-visible:outline-none focus-visible:border-vq-violet/60 focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <svg viewBox="0 0 16 16" className="size-4 text-vq-text-lo" aria-hidden="true" fill="none">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        className={cn(
          'relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-vq-card border border-vq-border bg-vq-bg-overlay shadow-elev-3',
          'data-[state=open]:animate-[vq-pop-in_160ms_var(--ease-out-soft)] data-[state=closed]:animate-[vq-fade-out_120ms_ease]',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1 w-[var(--radix-select-trigger-width)]',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-vq-sm py-1.5 pr-8 pl-2.5 text-sm text-vq-text-hi outline-none',
        'data-[highlighted]:bg-primary-500/12 data-[highlighted]:text-primary-500 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none">
          <path
            d="M3.5 8.5l3 3 6-6.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2.5 py-1.5 font-medium text-vq-text-lo text-xs', className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator className={cn('my-1 h-px bg-vq-border', className)} {...props} />
  );
}
