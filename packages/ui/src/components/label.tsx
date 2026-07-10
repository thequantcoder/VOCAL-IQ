'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../lib/cn';

/**
 * Label (UX-03) — Radix Label (associates via htmlFor, click-to-focus). `required` renders an accent
 * asterisk. Pairs with FormField for the full labelled-control pattern.
 */
export function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'font-medium text-sm text-vq-text-hi peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-accent-600 dark:text-accent-400" aria-hidden="true">
          *
        </span>
      )}
    </LabelPrimitive.Root>
  );
}
