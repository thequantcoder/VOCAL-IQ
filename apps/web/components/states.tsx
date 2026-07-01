'use client';

import { Button, cn } from '@vocaliq/ui';
import type { ReactNode } from 'react';

/**
 * The four async states every dashboard view must handle (DESIGN-SYSTEM §7): loading
 * (skeleton, not a spinner), empty (invite an action), error (message + retry), success.
 * Skeletons hold still under `prefers-reduced-motion`.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-vq bg-vq-bg-elevated motion-reduce:animate-none',
        className,
      )}
      aria-hidden
    />
  );
}

export function LoadingCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows have no stable id
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-vq-card border border-vq-border border-dashed px-6 py-14 text-center">
      <p className="font-display text-lg text-vq-text-hi">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-vq-text-lo">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-vq-card border border-vq-danger/40 bg-vq-danger/5 px-6 py-12 text-center"
    >
      <p className="font-medium text-vq-text-hi">Couldn’t load this</p>
      <p className="max-w-sm text-sm text-vq-text-lo">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
