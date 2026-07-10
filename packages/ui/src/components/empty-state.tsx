import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * EmptyState (UX-03) — the illustrated "nothing here yet" surface with a single clear CTA. Used across
 * lists; doubles as onboarding (UX-14). The icon sits in a soft branded halo.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-vq-card border border-vq-border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <span className="grid size-12 place-items-center rounded-full bg-primary-500/10 text-primary-500">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-display font-semibold text-vq-text-hi">{title}</p>
        {hint && <p className="max-w-sm text-sm text-vq-text-lo">{hint}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
