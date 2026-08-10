'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The agent's conversational state (UX-04) — the single vocabulary every voice-motion primitive
 * (LiveWaveform, VoiceOrb, ConversationViz, TranscriptStream, indicators) subscribes to, so a live call
 * or a demo choreographs them together.
 *
 * `idle` (breathing) → `listening` (caller speaking) → `thinking` (LLM) → `speaking` (agent TTS).
 */
export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

export const AGENT_STATES: readonly AgentState[] = ['idle', 'listening', 'thinking', 'speaking'];

/** Who is holding the turn — drives ConversationViz + transcript colouring. */
export function activeSpeaker(state: AgentState): 'agent' | 'caller' | null {
  if (state === 'speaking') return 'agent';
  if (state === 'listening') return 'caller';
  return null;
}

/** Minimal controlled state machine. `next` advances through the canonical cycle. */
export function useAgentState(initial: AgentState = 'idle') {
  const [state, setState] = useState<AgentState>(initial);
  const next = useCallback(() => {
    setState((s) => {
      const i = AGENT_STATES.indexOf(s);
      return AGENT_STATES[(i + 1) % AGENT_STATES.length] as AgentState;
    });
  }, []);
  return { state, setState, next };
}

/**
 * Auto-cycling agent for demos / idle previews — walks listening→thinking→speaking→idle on a loop with
 * realistic dwell times. `enabled=false` freezes it. Cleans its timer up on unmount.
 */
export function useSimulatedAgent(enabled = true) {
  const [state, setState] = useState<AgentState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Per-state dwell (ms) — listening + speaking run longer than the think beat.
    const dwell: Record<AgentState, number> = {
      idle: 900,
      listening: 2600,
      thinking: 1100,
      speaking: 3200,
    };
    const order: AgentState[] = ['listening', 'thinking', 'speaking', 'idle'];
    let i = -1;
    const tick = () => {
      i = (i + 1) % order.length;
      const nextState = order[i] as AgentState;
      setState(nextState);
      timer.current = setTimeout(tick, dwell[nextState]);
    };
    tick();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled]);

  return state;
}
