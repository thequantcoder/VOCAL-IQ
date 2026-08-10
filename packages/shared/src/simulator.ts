import { FlowNodeType } from './enums.js';
import { type CompiledFlow, FlowRunner } from './flow-compiler.js';

/**
 * Conversation simulator runtime (Day 32). Drives a compiled flow (Day 22) against a
 * scriptable caller — no telephony, no live providers — and emits a typed event stream
 * (active node, agent/caller turns, captures, decisions, tool calls, end). Deterministic
 * given a scripted caller, so it is fully unit-tested and powers the in-browser sandbox.
 *
 * Cost note (self-audit D): a SCRIPTED caller is free (no LLM). An LLM-driven persona
 * caller (production, injected) costs tokens — `estCostUsd` estimates the agent-side token
 * spend so the sandbox can flag it; the estimate is intentionally conservative, not billing.
 */

// ── Events ──────────────────────────────────────────────────────────────────────

export type SimEvent =
  | { kind: 'node'; nodeId: string; nodeType: string }
  | { kind: 'agent'; text: string }
  | { kind: 'caller'; text: string; intent?: string }
  | { kind: 'capture'; vars: Record<string, string> }
  | { kind: 'tool'; name: string }
  | { kind: 'end'; outcome: string }
  | { kind: 'halt'; reason: 'max_turns' | 'caller_ended' | 'dead_end' };

export interface SimTurn {
  role: 'agent' | 'caller';
  text: string;
}

export interface SimResult {
  events: SimEvent[];
  transcript: SimTurn[];
  /** Distinct node ids visited, in order. */
  visited: string[];
  /** Estimated agent-side LLM cost in USD (conservative; NOT billing). */
  estCostUsd: number;
  outcome: string;
}

// ── Scriptable caller ─────────────────────────────────────────────────────────

export interface CallerInput {
  text: string;
  /** Optional classified intent, used to pick Decision branches deterministically. */
  intent?: string;
  /** True → the caller hangs up; the simulation halts. */
  end?: boolean;
}

export interface CallerContext {
  agentSaid: string;
  turn: number;
}

/** A simulated caller: returns the next utterance for a Listen node, or null to hang up. */
export type SimulatedCaller = (ctx: CallerContext) => CallerInput | null;

/**
 * A deterministic caller that replays pre-scripted lines (free — no LLM). Each line may be
 * a string or `{text, intent}`. When the lines run out, the caller hangs up.
 */
export function scriptedCaller(lines: Array<string | CallerInput>): SimulatedCaller {
  let i = 0;
  return () => {
    const line = lines[i++];
    if (line === undefined) return null;
    return typeof line === 'string' ? { text: line } : line;
  };
}

// ── Cost estimate ─────────────────────────────────────────────────────────────

const USD_PER_1K_TOKENS = 0.001; // nominal blended rate for the SANDBOX estimate only
const estTokens = (text: string) => Math.ceil(text.length / 4);
const estCost = (text: string) => (estTokens(text) / 1000) * USD_PER_1K_TOKENS;

// ── Runtime ─────────────────────────────────────────────────────────────────────

/**
 * Run a full simulated conversation. Steps the compiled flow: agent-speaking nodes emit an
 * `agent` turn, Listen nodes pull the next `caller` input (and record captures), Decisions
 * route on the caller's last intent, other nodes emit a `tool` event. Halts at End, when
 * the caller hangs up, on a dead end, or at the hard step cap (termination guarantee).
 */
export function runSimulation(
  flow: CompiledFlow,
  caller: SimulatedCaller,
  opts: { maxTurns?: number } = {},
): SimResult {
  const maxTurns = opts.maxTurns ?? 40;
  const maxSteps = maxTurns * 6; // hard cap on node-steps (guards cyclic graphs)

  const runner = new FlowRunner(flow);
  const events: SimEvent[] = [];
  const transcript: SimTurn[] = [];
  const visited: string[] = [];
  let estCostUsd = 0;
  let lastAgentText = '';
  let lastIntent: string | undefined;
  let turns = 0;
  let outcome = 'incomplete';

  for (let step = 0; step < maxSteps; step++) {
    const node = runner.activeNode;
    if (!node) {
      events.push({ kind: 'halt', reason: 'dead_end' });
      outcome = 'dead_end';
      break;
    }
    visited.push(node.id);
    events.push({ kind: 'node', nodeId: node.id, nodeType: node.type });

    if (node.type === FlowNodeType.END) {
      outcome = (node.config.outcome as string) || 'completed';
      events.push({ kind: 'end', outcome });
      break;
    }

    if (node.type === FlowNodeType.START || node.type === FlowNodeType.SAY) {
      const text = agentText(node.config, node.type);
      if (text) {
        lastAgentText = text;
        transcript.push({ role: 'agent', text });
        events.push({ kind: 'agent', text });
        // Only 'generated' Say (and any LLM turn) costs tokens.
        if (node.type === FlowNodeType.SAY && node.config.mode === 'generated') {
          estCostUsd += estCost(text);
        }
      }
    } else if (node.type === FlowNodeType.LISTEN) {
      const input = caller({ agentSaid: lastAgentText, turn: turns });
      if (!input || input.end) {
        events.push({ kind: 'halt', reason: 'caller_ended' });
        outcome = 'caller_ended';
        break;
      }
      turns++;
      lastIntent = input.intent;
      transcript.push({ role: 'caller', text: input.text });
      events.push({
        kind: 'caller',
        text: input.text,
        ...(input.intent ? { intent: input.intent } : {}),
      });
      const captureNames = node.captures.map((c) => c.name);
      if (captureNames.length > 0) {
        const vars: Record<string, string> = {};
        for (const name of captureNames) vars[name] = input.text;
        events.push({ kind: 'capture', vars });
      }
    } else if (node.type !== FlowNodeType.DECISION) {
      // Tool / Knowledge / Collect&Confirm / Transfer / Sub-flow / Squad-handoff: simulated.
      const name = (node.config.name as string) || node.type.toLowerCase();
      events.push({ kind: 'tool', name });
    }

    // Advance. Decisions route on the caller's most recent intent.
    const signal = node.type === FlowNodeType.DECISION && lastIntent ? { intent: lastIntent } : {};
    const next = runner.advance(signal);
    if (next === null) {
      events.push({ kind: 'halt', reason: 'dead_end' });
      outcome = 'dead_end';
      break;
    }
    if (step === maxSteps - 1) {
      events.push({ kind: 'halt', reason: 'max_turns' });
      outcome = 'max_turns';
    }
  }

  return { events, transcript, visited, estCostUsd, outcome };
}

/** The text an agent node speaks: Start's opening line, Say's scripted text or a generated stub. */
function agentText(config: Record<string, unknown>, type: string): string {
  if (type === FlowNodeType.START) return (config.openingLine as string) || '';
  if (config.mode === 'generated') {
    const prompt = (config.prompt as string) || '';
    return prompt ? `(generated) ${prompt}` : '';
  }
  return (config.text as string) || '';
}
