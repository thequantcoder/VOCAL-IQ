'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '../lib/cn';

/**
 * AlertDialog (UX-03) — a focus-trapped confirm for destructive/irreversible actions (Radix a11y).
 * `AlertDialog` / `AlertDialogTrigger` / `AlertDialogContent` / `…Title` / `…Description` / `…Action`
 * / `…Cancel`. The Action is styled by the consumer (pass `className`).
 */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
          'data-[state=open]:animate-[vq-fade-in_180ms_ease] data-[state=closed]:animate-[vq-fade-out_140ms_ease]',
        )}
      />
      <AlertDialogPrimitive.Content
        className={cn(
          '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md flex-col gap-4 rounded-vq-card border border-vq-border bg-vq-bg-elevated p-5 shadow-elev-3 outline-none',
          'data-[state=open]:animate-[vq-pop-in_190ms_var(--ease-out-soft)] data-[state=closed]:animate-[vq-pop-out_140ms_ease]',
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('font-display font-semibold text-lg text-vq-text-hi', className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-sm text-vq-text-lo', className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}
