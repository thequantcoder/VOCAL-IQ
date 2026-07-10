'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/cn';

/**
 * Dropdown menu (UX-03) — Radix a11y (keyboard nav, typeahead, ARIA) + our tokens. Re-exports the
 * primitive parts + styled Content/Item/Label/Separator.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-vq-card border border-vq-border bg-vq-bg-overlay p-1 text-vq-text-hi shadow-elev-3 outline-none',
          'data-[state=open]:animate-[vq-pop-in_150ms_var(--ease-out-soft)] data-[state=closed]:animate-[vq-pop-out_110ms_ease]',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  inset,
  destructive,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  destructive?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-vq-sm px-2 py-1.5 text-sm outline-none transition-colors',
        'focus:bg-primary-500/12 focus:text-vq-text-hi data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        destructive && 'text-danger focus:bg-danger-subtle focus:text-danger',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1.5 font-medium text-vq-text-lo text-xs', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-vq-border', className)}
      {...props}
    />
  );
}
