'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/cn';

/**
 * Sheet / Drawer (UX-03) — a side panel built on Radix Dialog (focus-trap, escape, scroll-lock) that
 * slides in from an edge. `Sheet` / `SheetTrigger` / `SheetContent` (`side` prop) / `SheetClose` +
 * header/title/description helpers. Used for mobile nav + detail panels.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

type Side = 'right' | 'left' | 'top' | 'bottom';

const sideClasses: Record<Side, string> = {
  right:
    'inset-y-0 right-0 h-full w-[min(24rem,90vw)] border-l data-[state=open]:animate-[vq-slide-in-right_260ms_var(--ease-out-soft)] data-[state=closed]:animate-[vq-slide-out-right_200ms_ease]',
  left: 'inset-y-0 left-0 h-full w-[min(24rem,90vw)] border-r data-[state=open]:animate-[vq-slide-in-left_260ms_var(--ease-out-soft)] data-[state=closed]:animate-[vq-slide-out-left_200ms_ease]',
  top: 'inset-x-0 top-0 max-h-[85vh] w-full border-b data-[state=open]:animate-[vq-fade-in_220ms_ease]',
  bottom:
    'inset-x-0 bottom-0 max-h-[85vh] w-full border-t data-[state=open]:animate-[vq-fade-in_220ms_ease]',
};

export function SheetContent({
  className,
  side = 'right',
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: Side }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
          'data-[state=open]:animate-[vq-fade-in_200ms_ease] data-[state=closed]:animate-[vq-fade-out_160ms_ease]',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 overflow-y-auto border-vq-border bg-vq-bg-elevated p-5 shadow-elev-3 outline-none',
          sideClasses[side],
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

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 pr-6', className)} {...props} />;
}
export function SheetTitle({
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
export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-vq-text-lo', className)} {...props} />
  );
}
