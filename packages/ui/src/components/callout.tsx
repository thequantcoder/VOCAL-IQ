import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Callout / inline banner (UX-03) — a contextual note (info/success/warn/danger). Semantic-token
 * driven; the left rule + tint come from the state colour so it re-skins with the theme.
 */

export type CalloutVariant = 'info' | 'success' | 'warn' | 'danger' | 'neutral';

const variants: Record<CalloutVariant, { box: string; rule: string }> = {
  info: { box: 'bg-info-subtle', rule: 'bg-info' },
  success: { box: 'bg-success-subtle', rule: 'bg-success' },
  warn: { box: 'bg-warn-subtle', rule: 'bg-warn' },
  danger: { box: 'bg-danger-subtle', rule: 'bg-danger' },
  neutral: { box: 'bg-neutral-500/8', rule: 'bg-neutral-400' },
};

export function Callout({
  variant = 'info',
  icon,
  title,
  children,
  className,
}: {
  variant?: CalloutVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const v = variants[variant];
  return (
    <div
      className={cn('relative overflow-hidden rounded-vq p-3 pl-4', v.box, className)}
      role="note"
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', v.rule)} aria-hidden />
      <div className="flex gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-vq-text-hi">{icon}</span>}
        <div className="flex flex-col gap-0.5 text-sm">
          {title && <span className="font-medium text-vq-text-hi">{title}</span>}
          {children && <span className="text-vq-text-lo">{children}</span>}
        </div>
      </div>
    </div>
  );
}
