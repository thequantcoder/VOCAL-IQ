import { FlowNodeType } from './enums.js';
import { type CompiledFlow, type CompiledNode, nextNode } from './flow-compiler.js';

/**
 * Multimodal chat runtime (Day 45). Drives a COMPILED flow (Day 22) turn-by-turn so ONE
 * agent definition serves voice, web chat, and messaging (WhatsApp/SMS) identically. The
 * flow logic — which node runs, what the agent says, which branch a decision takes, what is
 * captured — is channel-independent; only rendering differs (`renderForChannel`). Voice and
 * text therefore stay consistent by construction (self-audit A). State is a plain,
 * serialisable object, so the runtime is stateless on the server: the caller passes it back
 * each turn (like the Day-32 sandbox). Deterministic + pure → fully unit-tested, no LLM.
 */

export type ChatChannel = 'VOICE' | 'CHAT' | 'WHATSAPP' | 'SMS';

/** Text channels (chat/messaging) vs the voice channel — used for channel-aware rendering. */
export const isTextChannel = (c: ChatChannel): boolean => c !== 'VOICE';

export interface ChatMessage {
  role: 'agent' | 'user';
  text: string;
}

/** Serialisable conversation state — the caller round-trips this each turn. */
export interface ChatState {
  channel: ChatChannel;
  activeNode: string;
  captured: Record<string, string>;
  lastIntent?: string;
  turns: number;
  awaitingInput: boolean;
  done: boolean;
  outcome?: string;
}

export interface ChatAdvance {
  state: ChatState;
  /** Agent messages produced this step, already rendered for the channel. */
  messages: ChatMessage[];
  awaitingInput: boolean;
  done: boolean;
  outcome?: string;
}

const MAX_STEPS = 200; // termination guard for cyclic graphs

/** Channel-aware rendering. Text channels strip voice-only SSML tags + collapse whitespace. */
export function renderForChannel(text: string, channel: ChatChannel): string {
  if (channel === 'VOICE') return text;
  return text
    .replace(/<[^>]+>/g, '') // drop <break/>, <emphasis>… SSML
    .replace(/\s+/g, ' ')
    .trim();
}

/** The raw text an agent node speaks (channel-independent). */
function agentText(node: CompiledNode): string {
  if (node.type === FlowNodeType.START) return (node.config.openingLine as string) || '';
  if (node.type === FlowNodeType.SAY) {
    if (node.config.mode === 'generated') {
      const prompt = (node.config.prompt as string) || '';
      return prompt ? `(generated) ${prompt}` : '';
    }
    return (node.config.text as string) || '';
  }
  return '';
}

/**
 * Run the flow forward from `state.activeNode`, emitting agent messages, taking decision
 * branches on the last intent, and running non-interactive nodes, until it reaches a Listen
 * node (awaiting user input), an End, or a dead end. Pure: returns a new state + the messages.
 */
function stepForward(flow: CompiledFlow, start: ChatState): ChatAdvance {
  const state: ChatState = { ...start, captured: { ...start.captured } };
  const messages: ChatMessage[] = [];
  const push = (text: string) => {
    const rendered = renderForChannel(text, state.channel);
    if (rendered) messages.push({ role: 'agent', text: rendered });
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const node = flow.nodes[state.activeNode];
    if (!node) {
      state.done = true;
      state.outcome = 'dead_end';
      state.awaitingInput = false;
      return { state, messages, awaitingInput: false, done: true, outcome: state.outcome };
    }

    if (node.type === FlowNodeType.END) {
      state.done = true;
      state.awaitingInput = false;
      state.outcome = (node.config.outcome as string) || 'completed';
      return { state, messages, awaitingInput: false, done: true, outcome: state.outcome };
    }

    if (node.type === FlowNodeType.LISTEN) {
      // Stop and wait for the user — the same behaviour on every channel.
      state.awaitingInput = true;
      return { state, messages, awaitingInput: true, done: false };
    }

    if (node.type === FlowNodeType.START || node.type === FlowNodeType.SAY) {
      push(agentText(node));
    } else if (node.type === FlowNodeType.TRANSFER || node.type === FlowNodeType.SQUAD_HANDOFF) {
      // Channel-aware node behaviour: a live transfer only exists on voice; on a text
      // channel we surface an equivalent hand-off line instead of dropping the turn.
      if (isTextChannel(state.channel)) {
        const to = (node.config.label as string) || (node.config.name as string) || 'a specialist';
        push(`Connecting you to ${to}. Someone will follow up here shortly.`);
      }
    }
    // TOOL / KNOWLEDGE / COLLECT_CONFIRM / SUBFLOW execute silently in this runtime
    // (their side-effects are handled by the channel host); DECISION just routes.

    const signal =
      node.type === FlowNodeType.DECISION && state.lastIntent ? { intent: state.lastIntent } : {};
    const next = nextNode(flow, state.activeNode, signal);
    if (next === null) {
      state.done = true;
      state.outcome = 'dead_end';
      state.awaitingInput = false;
      return { state, messages, awaitingInput: false, done: true, outcome: state.outcome };
    }
    state.activeNode = next;
  }

  // Hit the step cap (cyclic graph) — halt deterministically.
  state.done = true;
  state.outcome = 'max_steps';
  state.awaitingInput = false;
  return { state, messages, awaitingInput: false, done: true, outcome: 'max_steps' };
}

/** Begin a conversation on a channel: runs the opening turns up to the first user prompt. */
export function startChat(
  flow: CompiledFlow,
  opts: { channel: ChatChannel; context?: Record<string, string> },
): ChatAdvance {
  const state: ChatState = {
    channel: opts.channel,
    activeNode: flow.entry,
    captured: { ...(opts.context ?? {}) },
    turns: 0,
    awaitingInput: false,
    done: false,
  };
  return stepForward(flow, state);
}

/**
 * Feed one user message into a conversation awaiting input. Records the Listen node's
 * captures + intent, advances past it, then runs forward to the next prompt / end. If the
 * conversation is already done, it's a no-op.
 */
export function chatTurn(
  flow: CompiledFlow,
  prev: ChatState,
  userText: string,
  opts: { intent?: string } = {},
): ChatAdvance {
  if (prev.done) {
    return {
      state: prev,
      messages: [],
      awaitingInput: false,
      done: true,
      ...(prev.outcome ? { outcome: prev.outcome } : {}),
    };
  }
  const node = flow.nodes[prev.activeNode];
  const state: ChatState = { ...prev, captured: { ...prev.captured } };

  // Apply the input at the awaiting Listen node: record captures + intent, then advance past.
  if (node && node.type === FlowNodeType.LISTEN) {
    for (const c of node.captures) state.captured[c.name] = userText;
    if (opts.intent) state.lastIntent = opts.intent;
    state.turns += 1;
    state.awaitingInput = false;
    const next = nextNode(flow, state.activeNode, {});
    if (next === null) {
      state.done = true;
      state.outcome = 'dead_end';
      return { state, messages: [], awaitingInput: false, done: true, outcome: 'dead_end' };
    }
    state.activeNode = next;
  } else if (opts.intent) {
    state.lastIntent = opts.intent;
  }

  return stepForward(flow, state);
}
