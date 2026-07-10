'use client';

import { m } from 'framer-motion';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import type { AgentState } from './use-agent-state';
import { activeSpeaker } from './use-agent-state';

/**
 * ConversationViz (UX-04) — two nodes (agent ↔ caller) joined by a connection that lights up on the
 * active speaker, with a pulse that travels toward the listener for turn-taking. Used in call cards, the
 * live console, and the landing demo. Under reduced-motion the active node simply highlights (no travel).
 */
export interface ConversationVizProps {
  state?: AgentState;
  agentLabel?: string;
  callerLabel?: string;
  className?: string;
}

function Node({
  label,
  glyph,
  active,
  tone,
}: {
  label: string;
  glyph: string;
  active: boolean;
  tone: 'agent' | 'caller';
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          'grid size-12 place-items-center rounded-full border-2 font-semibold text-sm transition-all duration-300',
          active
            ? tone === 'agent'
              ? 'border-primary-500 bg-primary-500/15 text-primary-500 shadow-[0_0_0_4px_var(--primary-500)]/10'
              : 'border-accent-500 bg-accent-500/15 text-accent-600 dark:text-accent-300'
            : 'border-vq-border text-vq-text-lo',
        )}
      >
        {glyph}
      </div>
      <span className={cn('font-medium text-xs', active ? 'text-vq-text-hi' : 'text-vq-text-lo')}>
        {label}
      </span>
    </div>
  );
}

export function ConversationViz({
  state = 'idle',
  agentLabel = 'Agent',
  callerLabel = 'Caller',
  className,
}: ConversationVizProps) {
  const { animate } = useMotionLevel();
  const speaker = activeSpeaker(state);
  const live = speaker !== null;
  // Pulse travels FROM the speaker TO the listener.
  const toCaller = speaker === 'agent';

  return (
    <div
      className={cn('flex items-center justify-center gap-3', className)}
      role="img"
      aria-label={`${agentLabel} and ${callerLabel} — ${state}`}
    >
      <Node label={agentLabel} glyph="AI" active={speaker === 'agent'} tone="agent" />

      <div className="relative h-0.5 w-20 overflow-visible rounded-vq-pill bg-neutral-500/25">
        {/* Lit connection when a turn is active. */}
        <span
          className={cn(
            'absolute inset-0 rounded-vq-pill transition-opacity duration-300',
            live ? 'opacity-100' : 'opacity-0',
            toCaller
              ? 'bg-gradient-to-r from-primary-500 to-accent-500'
              : 'bg-gradient-to-l from-primary-500 to-accent-500',
          )}
        />
        {/* Traveling turn-taking pulse. */}
        {animate && live && (
          <m.span
            className="-translate-y-1/2 absolute top-1/2 size-2 rounded-full bg-white shadow-elev-1"
            initial={{ left: toCaller ? '0%' : '100%', opacity: 0 }}
            animate={{ left: toCaller ? '100%' : '0%', opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          />
        )}
      </div>

      <Node label={callerLabel} glyph="◕" active={speaker === 'caller'} tone="caller" />
    </div>
  );
}
