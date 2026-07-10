import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Shimmer skeleton (UX-03) — a loading placeholder. Shimmer stops under reduced/off motion (ui.css). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('vq-skeleton rounded-vq bg-neutral-500/10', className)}
      aria-hidden
      {...props}
    />
  );
}
