'use client';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { cn } from '../lib/cn';

/**
 * Accordion (UX-03) — Radix Accordion (single/multiple, keyboard, a11y). Content expands via Radix's
 * CSS height vars (`--radix-accordion-content-height`) with our keyframes; the chevron rotates. Killed
 * under reduced-motion. Compose <Accordion><AccordionItem><AccordionTrigger/><AccordionContent/>…
 */
export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item className={cn('border-vq-border border-b', className)} {...props} />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'group flex flex-1 items-center justify-between gap-3 py-3 text-left font-medium text-sm text-vq-text-hi',
          'transition-colors hover:text-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
          className,
        )}
        {...props}
      >
        {children}
        <svg
          viewBox="0 0 16 16"
          className="size-4 shrink-0 text-vq-text-lo transition-transform duration-200 ease-[var(--ease-out-soft)] group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
          fill="none"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className={cn(
        'overflow-hidden text-sm text-vq-text-lo',
        'data-[state=open]:motion-safe:animate-[vq-accordion-down_220ms_var(--ease-out-soft)] data-[state=closed]:motion-safe:animate-[vq-accordion-up_180ms_var(--ease-out-soft)]',
        className,
      )}
      {...props}
    >
      <div className="pb-3">{children}</div>
    </AccordionPrimitive.Content>
  );
}
