'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { m } from 'framer-motion';
import { createContext, useContext, useId } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * Tabs (UX-03) — Radix Tabs (roving focus, arrow keys, a11y) with a framer `layoutId` underline that
 * slides to the active trigger (killed under reduced-motion). Compose
 * <Tabs><TabsList><TabsTrigger/>…</TabsList><TabsContent/>…</Tabs>.
 */
const TabsCtx = createContext<{ layoutId: string; animate: boolean }>({
  layoutId: 'tabs',
  animate: true,
});

export function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const layoutId = useId();
  const { animate } = useMotionLevel();
  return (
    <TabsCtx.Provider value={{ layoutId, animate }}>
      <TabsPrimitive.Root {...props} />
    </TabsCtx.Provider>
  );
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('relative flex items-center gap-1 border-vq-border border-b', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { layoutId, animate } = useContext(TabsCtx);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'group relative px-3 py-2 font-medium text-sm text-vq-text-lo transition-colors',
        'hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
        'data-[state=active]:text-primary-500 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <span className="pointer-events-none absolute inset-x-0 bottom-[-1px] hidden h-0.5 group-data-[state=active]:block">
        <m.span
          {...(animate ? { layoutId } : {})}
          className="block h-full rounded-vq-pill bg-primary-500"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      </span>
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'mt-4 focus-visible:outline-none data-[state=active]:motion-safe:animate-[vq-fade-in_200ms_var(--ease-out-soft)]',
        className,
      )}
      {...props}
    />
  );
}
