'use client';

import { m } from 'framer-motion';
import { useMemo } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import type { AgentState } from '../voice/use-agent-state';

/**
 * AgentAvatar (UX-05) — a procedural, deterministic "face" for a voice agent. A gradient disc + a
 * geometric voice motif (concentric arcs) are seeded from the agent id, so every agent looks distinct
 * but stable across renders. Optionally reacts to `useAgentState` (subtle idle drift, speaking pulse)
 * and accepts a real image `src` (for video-avatar agents, Day 92). Reduced-motion → static disc.
 */
export interface AgentAvatarProps {
  /** Stable id/string that seeds the look (e.g. agent id). */
  seed: string;
  /** For the fallback initial + accessible label. */
  name?: string;
  size?: number;
  state?: AgentState;
  /** Real image (video-avatar agents); falls back to the procedural face. */
  src?: string;
  className?: string;
}

/** Cheap deterministic string hash → 32-bit unsigned int. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function AgentAvatar({
  seed,
  name,
  size = 44,
  state = 'idle',
  src,
  className,
}: AgentAvatarProps) {
  const { animate } = useMotionLevel();
  const gid = useMemo(() => `agent-av-${hashSeed(seed).toString(36)}`, [seed]);

  const look = useMemo(() => {
    const h = hashSeed(seed);
    // Two hues in the brand arc (violet 250° → cyan 190°), rotated by the seed.
    const base = 190 + (h % 80); // 190..270
    const hue1 = base;
    const hue2 = (base + 40 + ((h >> 8) % 40)) % 360;
    const arcs = 2 + (h % 3); // 2..4 concentric arcs
    const rot = h % 360;
    const initial = (name?.trim()?.[0] ?? 'A').toUpperCase();
    return { hue1, hue2, arcs, rot, initial };
  }, [seed, name]);

  const speaking = animate && state === 'speaking';
  const listening = animate && state === 'listening';

  return (
    <m.div
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      animate={
        speaking
          ? { scale: [1, 1.06, 0.99, 1.04, 1] }
          : listening
            ? { scale: [1, 1.02, 1] }
            : { scale: 1 }
      }
      transition={
        speaking
          ? { duration: 0.9, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
          : listening
            ? { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
            : { duration: 0.3 }
      }
      role="img"
      aria-label={name ? `${name} avatar` : 'Agent avatar'}
    >
      {/* Speaking ring. */}
      {speaking && (
        <span className="absolute inset-0 rounded-full ring-2 ring-accent-400/60 motion-safe:animate-[vq-live-ping_1.2s_var(--ease-out-soft)_infinite]" />
      )}

      {src ? (
        <img
          src={src}
          alt={name ? `${name} avatar` : 'Agent avatar'}
          className="size-full rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          className="rounded-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={`hsl(${look.hue1} 85% 62%)`} />
              <stop offset="100%" stopColor={`hsl(${look.hue2} 85% 55%)`} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={`url(#${gid})`} />
          {/* Concentric "voice" arcs, rotated by the seed. */}
          <g
            transform={`rotate(${look.rot} 50 50)`}
            fill="none"
            stroke="white"
            strokeLinecap="round"
            opacity="0.55"
          >
            {Array.from({ length: look.arcs }, (_, i) => {
              const r = 16 + i * 9;
              return (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: arcs are positional and fixed.
                  key={i}
                  d={`M ${50 - r} 50 A ${r} ${r} 0 0 1 ${50 + r} 50`}
                  strokeWidth={2.4 - i * 0.3}
                />
              );
            })}
          </g>
          <circle cx="50" cy="50" r="5" fill="white" opacity="0.9" />
        </svg>
      )}
    </m.div>
  );
}
