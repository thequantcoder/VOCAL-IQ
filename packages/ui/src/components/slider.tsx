'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../lib/cn';

/**
 * Slider (UX-03) — Radix Slider (keyboard, multi-thumb). Filled range + thumb use the primary token;
 * the thumb grows slightly on hover/focus. Supports one or many thumbs via `value`/`defaultValue`.
 */
export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = props.value ?? props.defaultValue ?? [0];
  return (
    <SliderPrimitive.Root
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-vq-pill bg-neutral-500/25">
        <SliderPrimitive.Range className="absolute h-full rounded-vq-pill bg-primary-500" />
      </SliderPrimitive.Track>
      {thumbs.map((_, i) => (
        <SliderPrimitive.Thumb
          // biome-ignore lint/suspicious/noArrayIndexKey: thumbs are positional and have no stable id.
          key={i}
          className={cn(
            'block size-4 rounded-full border-2 border-primary-500 bg-vq-bg-elevated shadow-elev-1',
            'transition-transform duration-150 ease-[var(--ease-out-soft)] hover:scale-110 motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:ring-offset-2 focus-visible:ring-offset-vq-bg-base',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}
