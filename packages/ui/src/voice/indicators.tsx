'use client';

import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * Small agent-status indicators (UX-04). `ThinkingDots` — three bouncing dots for the LLM beat;
 * `ListeningPulse` — a cyan "live" dot with an expanding halo. Both reduce to a static form under
 * reduced-motion and expose an accessible label.
 */

export function ThinkingDots({
  className,
  label = 'Thinking',
}: { className?: string; label?: string }) {
  const { animate } = useMotionLevel();
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      // biome-ignore lint/a11y/useSemanticElements: an inline status indicator is correctly role="status".
      role="status"
      aria-label={label}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'size-1.5 rounded-full bg-primary-500',
            animate && 'motion-safe:animate-[vq-thinking-bounce_1s_ease-in-out_infinite]',
          )}
          style={animate ? { animationDelay: `${i * 0.16}s` } : undefined}
        />
      ))}
    </span>
  );
}

export function ListeningPulse({
  className,
  label = 'Listening',
}: {
  className?: string;
  label?: string;
}) {
  const { animate } = useMotionLevel();
  return (
    <span
      className={cn('relative inline-flex size-2.5 items-center justify-center', className)}
      // biome-ignore lint/a11y/useSemanticElements: an inline status indicator is correctly role="status".
      role="status"
      aria-label={label}
    >
      {animate && (
        <span className="absolute inline-flex size-full rounded-full bg-accent-400/60 motion-safe:animate-[vq-live-ping_1.4s_var(--ease-out-soft)_infinite]" />
      )}
      <span className="relative inline-flex size-2.5 rounded-full bg-accent-500" />
    </span>
  );
}
