'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/cn';

/**
 * Dialog / Modal (UX-03) — Radix a11y (focus-trap, escape, scroll-lock, ARIA) + our tokens + motion
 * (scale+fade via data-state keyframes; killed under motion-off). `Dialog` / `DialogTrigger` /
 * `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` / `DialogClose`.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
          'data-[state=open]:animate-[vq-fade-in_180ms_ease] data-[state=closed]:animate-[vq-fade-out_140ms_ease]',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg flex-col gap-4 rounded-vq-card border border-vq-border bg-vq-bg-elevated p-5 shadow-elev-3 outline-none',
          'data-[state=open]:animate-[vq-pop-in_190ms_var(--ease-out-soft)] data-[state=closed]:animate-[vq-pop-out_140ms_ease]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-vq-sm text-vq-text-lo transition-colors hover:bg-vq-bg-base hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
          aria-label="Close"
        >
          <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true" fill="none">
            <path
              d="M2 2l10 10M12 2L2 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 pr-6', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display font-semibold text-lg text-vq-text-hi', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-vq-text-lo', className)} {...props} />
  );
}
