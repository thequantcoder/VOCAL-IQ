'use client';

import { m } from 'framer-motion';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * Illustration set (UX-05) — a small library of on-brand SVG scenes for empty states (no agents / calls
 * / leads, all-done) and errors (404 / 500), built from the brand gradient + waveform/orb motif. Each
 * animates its motif on mount (killed under reduced-motion). Pair with `<EmptyState>`.
 */
export type IllustrationName =
  | 'no-agents'
  | 'no-calls'
  | 'no-leads'
  | 'all-done'
  | 'error-404'
  | 'error-500';

export function Illustration({
  name,
  size = 120,
  className,
}: {
  name: IllustrationName;
  size?: number;
  className?: string;
}) {
  const { animate } = useMotionLevel();
  const gid = useId();
  const grad = `il-grad-${gid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cn('shrink-0', className)}
      role="img"
      aria-label={ARIA[name]}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(124,92,255)" />
          <stop offset="100%" stopColor="rgb(34,211,238)" />
        </linearGradient>
      </defs>
      {/* Soft brand halo backdrop shared by every scene. */}
      <circle cx="60" cy="60" r="46" fill={`url(#${grad})`} opacity="0.1" />
      {SCENES[name]({ grad, animate })}
    </svg>
  );
}

const ARIA: Record<IllustrationName, string> = {
  'no-agents': 'No agents yet',
  'no-calls': 'No calls yet',
  'no-leads': 'No leads yet',
  'all-done': 'All done',
  'error-404': 'Page not found',
  'error-500': 'Something went wrong',
};

type SceneProps = { grad: string; animate: boolean };

const bars = [0.4, 0.75, 1, 0.6, 0.85, 0.5];

const SCENES: Record<IllustrationName, (p: SceneProps) => React.ReactNode> = {
  // A framed waveform — "no calls / no data yet".
  'no-calls': ({ grad, animate }) => (
    <>
      <rect
        x="30"
        y="38"
        width="60"
        height="44"
        rx="8"
        fill="none"
        stroke={`url(#${grad})`}
        strokeWidth="3"
      />
      <g transform="translate(40 60)">
        {bars.map((hpct, i) => (
          <m.rect
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional.
            key={i}
            x={i * 7}
            width="4"
            rx="2"
            fill={`url(#${grad})`}
            initial={animate ? { height: 4, y: -2 } : false}
            animate={{ height: hpct * 28, y: (-hpct * 28) / 2 }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </g>
    </>
  ),
  // An orb with a plus — "no agents yet".
  'no-agents': ({ grad, animate }) => (
    <>
      <m.circle
        cx="60"
        cy="56"
        r="20"
        fill={`url(#${grad})`}
        initial={animate ? { scale: 0.7, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        style={{ transformOrigin: '60px 56px' }}
      />
      <circle cx="53" cy="52" r="3" fill="white" opacity="0.9" />
      <path
        d="M78 78 h14 M85 71 v14"
        stroke={`url(#${grad})`}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </>
  ),
  // A person + spark — "no leads yet".
  'no-leads': ({ grad, animate }) => (
    <>
      <circle cx="60" cy="48" r="13" fill={`url(#${grad})`} />
      <path d="M38 84 a22 20 0 0 1 44 0" fill={`url(#${grad})`} opacity="0.85" />
      <m.path
        d="M86 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z"
        fill="rgb(34,211,238)"
        initial={animate ? { scale: 0, rotate: -30 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.2, 0, 0, 1] }}
        style={{ transformOrigin: '89px 50px' }}
      />
    </>
  ),
  // A check — "all done".
  'all-done': ({ grad, animate }) => (
    <>
      <circle cx="60" cy="60" r="26" fill={`url(#${grad})`} />
      <m.path
        d="M48 61 l8 8 16 -18"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </>
  ),
  // "404".
  'error-404': ({ grad }) => (
    <>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        fontSize="34"
        fontWeight="700"
        fill={`url(#${grad})`}
        fontFamily="ui-sans-serif, system-ui"
      >
        404
      </text>
      <circle cx="60" cy="40" r="4" fill="rgb(34,211,238)" />
    </>
  ),
  // Broken waveform — "500".
  'error-500': ({ grad, animate }) => (
    <>
      <m.path
        d="M32 60 h10 l6 -16 8 32 8 -24 6 12 h12"
        fill="none"
        stroke={`url(#${grad})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
      <path
        d="M84 74 l8 8 M92 74 l-8 8"
        stroke="rgb(244,63,94)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  ),
};
