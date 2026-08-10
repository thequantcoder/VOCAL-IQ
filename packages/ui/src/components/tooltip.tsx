'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Tooltip (UX-03) — Radix a11y (hover/focus, escape, ARIA) + our tokens. Self-contained (bundles its
 * own Provider) so it's drop-in: `<Tooltip content="…"><button/></Tooltip>`.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delayDuration = 250,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
  className?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn(
              'z-50 max-w-xs rounded-vq-sm border border-vq-border bg-vq-bg-overlay px-2 py-1 text-vq-text-hi text-xs shadow-elev-2',
              'data-[state=delayed-open]:animate-[vq-pop-in_140ms_var(--ease-out-soft)]',
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-vq-bg-overlay" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
