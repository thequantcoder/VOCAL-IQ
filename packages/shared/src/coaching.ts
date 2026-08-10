import { z } from 'zod';

/**
 * AI coaching / "whisper" for human agents (Day 74) — the pure, deterministic core shared by the
 * Agent Desk copilot. A private assistant listens to a live human-handled call and surfaces
 * suggested replies, KB answers, objection handling, and a next-best-action — shown ONLY to the
 * human agent, NEVER read to the caller. That last property is the whole point (self-audit C), so
 * it is encoded in the types and enforced by a guard here: every suggestion is stamped
 * `audience: 'agent'` on the `'whisper'` channel, and `assertAgentOnly` refuses anything else. The
 * objection/intent detection and next-best-action are pure functions so their relevance is unit-
 * testable without a model in the loop.
 */

/** The copilot has exactly one audience and one channel — there is deliberately no caller path. */
export const COACH_AUDIENCE = 'agent' as const;
export const COACH_CHANNEL = 'whisper' as const;
export type CoachAudience = typeof COACH_AUDIENCE;
export type CoachChannel = typeof COACH_CHANNEL;

export const COACH_SUGGESTION_KINDS = [
  'response',
  'kb_answer',
  'objection',
  'next_action',
  'compliance',
] as const;
export type CoachSuggestionKind = (typeof COACH_SUGGESTION_KINDS)[number];

export const coachSuggestionSchema = z.object({
  kind: z.enum(COACH_SUGGESTION_KINDS),
  /** Invariant: agent-only, whisper channel. Encoded so a caller-facing suggestion is unrepresentable. */
  audience: z.literal(COACH_AUDIENCE),
  channel: z.literal(COACH_CHANNEL),
  title: z.string(),
  body: z.string(),
  /** 0..1 model/heuristic confidence, for ordering + a UI hint. */
  confidence: z.number().min(0).max(1),
  /** Optional provenance for a KB answer (chunk id + a short snippet source). */
  source: z.string().optional(),
});
export type CoachSuggestion = z.infer<typeof coachSuggestionSchema>;

/**
 * Stamp a partial suggestion as agent-only / whisper. This is the ONLY constructor the service
 * uses, so a copilot suggestion can never be built for the caller. Returns a validated suggestion.
 */
export function sealAgentOnly(
  s: Omit<CoachSuggestion, 'audience' | 'channel'> & { confidence?: number },
): CoachSuggestion {
  return coachSuggestionSchema.parse({
    ...s,
    audience: COACH_AUDIENCE,
    channel: COACH_CHANNEL,
    confidence: s.confidence ?? 0.6,
  });
}

/**
 * The never-spoken-to-caller guarantee, enforced at runtime (self-audit C). Throws if a suggestion
 * is not agent-only whisper — a defensive backstop the service runs over every item before it
 * returns, so even a future mistake can't leak copilot text onto the spoken channel.
 */
export function assertAgentOnly(s: CoachSuggestion): void {
  if (s.audience !== COACH_AUDIENCE || s.channel !== COACH_CHANNEL) {
    throw new Error('Coach suggestion is not agent-only — refusing to emit (would leak to caller)');
  }
}

// ── Objection / intent detection (pure, deterministic → testable relevance) ─────────

export interface Objection {
  tag: string;
  label: string;
  /** A short prompt the copilot shows the agent for handling this objection. */
  rebuttal: string;
}

const OBJECTION_RULES: { tag: string; label: string; rebuttal: string; cues: string[] }[] = [
  {
    tag: 'price',
    label: 'Price objection',
    rebuttal:
      'Acknowledge the concern, then reframe on value/ROI. Offer a cost breakdown or a lower tier.',
    cues: [
      'expensive',
      'too much',
      'cost too',
      'afford',
      'budget',
      'cheaper',
      'price is',
      'pricey',
    ],
  },
  {
    tag: 'stall',
    label: 'Stalling / not now',
    rebuttal: 'Create gentle urgency and pin a concrete next step with a specific time.',
    cues: [
      'think about it',
      'get back to',
      'not right now',
      'maybe later',
      'need time',
      'call me later',
    ],
  },
  {
    tag: 'competitor',
    label: 'Competitor mentioned',
    rebuttal:
      'Ask what is missing with their current tool, then differentiate on your unique value.',
    cues: [
      'competitor',
      'already using',
      'currently with',
      'another provider',
      'we use',
      'switch from',
    ],
  },
  {
    tag: 'authority',
    label: 'Not the decision-maker',
    rebuttal: 'Offer to include the decision-maker and send a one-page summary they can share.',
    cues: ['talk to my', 'my boss', 'my partner', 'the team', 'not my decision', 'run it by'],
  },
  {
    tag: 'trust',
    label: 'Trust / credibility concern',
    rebuttal: 'Share proof: references, a guarantee, security posture, and a short case study.',
    cues: ['is this a scam', 'not sure you', 'legit', 'reviews', 'guarantee', 'trust you'],
  },
  {
    tag: 'brushoff',
    label: 'Brush-off / opt-out',
    rebuttal:
      'Give one sentence of value and a low-friction yes/no. Respect an explicit opt-out immediately.',
    cues: ['not interested', 'no thanks', 'remove me', 'stop calling', 'take me off'],
  },
];

/** Detect objections in a caller utterance. Deterministic substring/intent match; order-stable. */
export function detectObjections(callerText: string): Objection[] {
  const text = callerText.toLowerCase();
  const found: Objection[] = [];
  for (const rule of OBJECTION_RULES) {
    if (rule.cues.some((c) => text.includes(c))) {
      found.push({ tag: rule.tag, label: rule.label, rebuttal: rule.rebuttal });
    }
  }
  return found;
}

// ── Next-best-action (pure) ─────────────────────────────────────────────────────────

export interface CoachState {
  objections: string[];
  /** −1..1 caller sentiment if known. */
  sentiment?: number;
  /** Has a price/quote already been given on this call? */
  hasQuote?: boolean;
}
export interface NextAction {
  action: string;
  rationale: string;
}

/** Pick the single next-best-action from detected objections + call state. Priority-ordered. */
export function nextBestAction(state: CoachState): NextAction {
  const o = new Set(state.objections);
  if (o.has('brushoff'))
    return {
      action: 'respect_optout',
      rationale: 'Caller signalled disinterest — confirm value once, then honour any opt-out.',
    };
  if (typeof state.sentiment === 'number' && state.sentiment < -0.3)
    return {
      action: 'de_escalate',
      rationale:
        'Caller sentiment is negative — slow down, acknowledge, and empathise before proceeding.',
    };
  if (o.has('price'))
    return {
      action: 'send_pricing_options',
      rationale: 'Price is the blocker — present tiered options and the value at each.',
    };
  if (o.has('competitor'))
    return {
      action: 'differentiate',
      rationale: 'A competitor is in play — surface your unique differentiators.',
    };
  if (o.has('authority'))
    return {
      action: 'loop_in_decision_maker',
      rationale: 'Not the decision-maker — offer to include them with a summary.',
    };
  if (o.has('stall'))
    return {
      action: 'book_followup',
      rationale: 'Caller is stalling — secure a concrete follow-up time now.',
    };
  if (state.hasQuote)
    return {
      action: 'ask_for_close',
      rationale: 'A quote is on the table — ask a direct closing question.',
    };
  return {
    action: 'clarify_need',
    rationale: 'Understand the caller’s primary goal before pitching.',
  };
}

// ── Post-call disposition draft (pure) ───────────────────────────────────────────────

export interface DispositionInput {
  durationSec: number;
  objections: string[];
  resolved?: boolean;
}
export interface DispositionDraft {
  disposition: string;
  note: string;
}

/** A first-draft disposition + note for the human to confirm/edit after the call (never auto-final). */
export function draftDisposition(input: DispositionInput): DispositionDraft {
  const disposition = input.resolved
    ? 'resolved'
    : input.objections.includes('brushoff')
      ? 'not_interested'
      : input.objections.length > 0
        ? 'follow_up'
        : 'completed';
  const mins = Math.max(1, Math.round(input.durationSec / 60));
  const objText = input.objections.length
    ? `Objections raised: ${input.objections.join(', ')}.`
    : 'No objections raised.';
  const note = `[AI draft — please review] ${mins}-min call. ${objText} Suggested disposition: ${disposition}.`;
  return { disposition, note };
}

// ── LLM prompt assembly (pure) ───────────────────────────────────────────────────────

export interface CoachTurn {
  role: 'caller' | 'agent';
  text: string;
}
export interface CoachContext {
  turns: CoachTurn[];
  objections: Objection[];
  /** KB snippets already retrieved (content + optional source), injected as grounding. */
  kb: { content: string; source?: string }[];
}

/**
 * Assemble the copilot's LLM messages. The system prompt states, unambiguously, that the output is
 * a PRIVATE whisper for the human agent that must never be read to the caller — the same guarantee
 * the type system and `assertAgentOnly` enforce, restated to the model.
 */
export function buildCoachMessages(ctx: CoachContext): { system: string; user: string } {
  const system =
    'You are a private real-time sales/support copilot for the HUMAN AGENT on a live call. ' +
    'Your output is shown ONLY on the agent’s screen and must NEVER be spoken or read to the caller. ' +
    'Be concise. Suggest at most 3 short things the agent could say next, grounded in the provided ' +
    'knowledge-base snippets when relevant. Do not invent facts beyond the snippets.';
  const convo = ctx.turns
    .slice(-8)
    .map((t) => `${t.role === 'caller' ? 'Caller' : 'Agent'}: ${t.text}`)
    .join('\n');
  const kb = ctx.kb.length
    ? `\n\nKnowledge base:\n${ctx.kb.map((k, i) => `[${i + 1}] ${k.content}`).join('\n')}`
    : '';
  const obj = ctx.objections.length
    ? `\n\nDetected objections: ${ctx.objections.map((o) => o.label).join(', ')}.`
    : '';
  const user = `Recent conversation:\n${convo}${obj}${kb}\n\nGive the agent up to 3 concise suggested replies.`;
  return { system, user };
}
