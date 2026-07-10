'use client';

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '../lib/cn';

/** A hairline divider (UX-03), horizontal or vertical. */
export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation={orientation}
      className={cn(
        'shrink-0 bg-vq-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
