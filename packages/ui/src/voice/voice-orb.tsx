'use client';

import { m } from 'framer-motion';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import type { AgentState } from './use-agent-state';

/**
 * VoiceOrb (UX-04) — the "AI agent presence" element: a gradient orb whose motion encodes state —
 * `idle` (slow breath), `listening` (inward ripple rings), `thinking` (rotating dashed ring + shimmer),
 * `speaking` (amplitude pulse). Built from SVG + framer loops; under reduced-motion it renders a calm
 * static orb (a soft glow, no loops).
 */
export interface VoiceOrbProps {
  state?: AgentState;
  size?: number;
  className?: string;
  label?: string;
}

export function VoiceOrb({ state = 'idle', size = 96, className, label }: VoiceOrbProps) {
  const { animate } = useMotionLevel();
  const id = `orb-${state}`;

  // Core breathing/pulse per state.
  const core =
    !animate || state === 'idle'
      ? { scale: 1, opacity: 1 }
      : state === 'speaking'
        ? { scale: [1, 1.12, 0.98, 1.08, 1], opacity: 1 }
        : state === 'listening'
          ? { scale: [1, 1.04, 1], opacity: 1 }
          : { scale: [1, 1.02, 1], opacity: [1, 0.9, 1] }; // thinking

  const coreDur = state === 'speaking' ? 0.9 : state === 'thinking' ? 1.6 : 3.4;

  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Listening ripples — expanding rings that fade. */}
      {animate &&
        state === 'listening' &&
        [0, 0.6, 1.2].map((delay) => (
          <m.span
            key={delay}
            className="absolute inset-0 rounded-full border border-accent-400/50"
            initial={{ scale: 0.6, opacity: 0.6 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{
              duration: 1.8,
              delay,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeOut',
            }}
          />
        ))}

      {/* Thinking — a rotating dashed ring. */}
      {animate && state === 'thinking' && (
        <m.svg
          className="absolute inset-0"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="rgb(34,211,238)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="6 14"
            opacity="0.7"
          />
        </m.svg>
      )}

      {/* The core orb. */}
      <m.svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        animate={core}
        transition={
          animate && state !== 'idle'
            ? { duration: coreDur, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
            : { duration: 0 }
        }
        style={{ willChange: 'transform' }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={id} cx="38%" cy="34%" r="72%">
            <stop offset="0%" stopColor="rgb(167, 139, 250)" />
            <stop offset="55%" stopColor="rgb(124, 92, 255)" />
            <stop offset="100%" stopColor="rgb(34, 211, 238)" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="34" fill={`url(#${id})`} />
        {/* Idle breath glow (CSS pulse, killed under reduced-motion). */}
        <circle
          cx="50"
          cy="50"
          r="34"
          fill={`url(#${id})`}
          className={cn(
            'opacity-40 [filter:blur(6px)]',
            animate && 'motion-safe:animate-[vq-orb-breathe_3.6s_ease-in-out_infinite]',
          )}
        />
        {/* Specular highlight. */}
        <ellipse cx="40" cy="36" rx="12" ry="8" fill="white" opacity="0.35" />
      </m.svg>
    </div>
  );
}
