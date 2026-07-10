import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** A keyboard-key hint, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd> (UX-03). */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-vq-sm border border-vq-border bg-vq-bg-elevated px-1.5 font-mono font-medium text-[11px] text-vq-text-lo',
        className,
      )}
      {...props}
    />
  );
}
