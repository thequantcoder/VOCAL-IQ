import { z } from 'zod';

/**
 * Sentiment-triggered live actions (Day 73) — pure rule evaluation shared across voice/api. The
 * live loop streams a per-turn sentiment signal; this matches it against a tenant/agent's rules and
 * returns the actions to fire (escalate to a human, alert a supervisor, shift tone, tag, pause).
 * Two correctness properties matter: A — a rule fires exactly when its metric crosses its threshold
 * in the configured direction; F — a fired rule is cooled-down so it doesn't re-fire every frame
 * (no alert storms, no lag from redundant work). Both are pure + deterministic here; the API
 * dispatches the returned actions.
 */

/** The metrics the live loop emits per turn (all normalized). */
export const SENTIMENT_METRICS = [
  'sentimentScore',
  'anger',
  'frustration',
  'buyingIntent',
] as const;
export type SentimentMetric = (typeof SENTIMENT_METRICS)[number];

/** sentimentScore is -1..1 (negative→positive); the others are 0..1 intensities. */
export interface SentimentSignal {
  sentimentScore: number;
  anger: number;
  frustration: number;
  buyingIntent: number;
}

export const SENTIMENT_ACTIONS = [
  'escalate',
  'alert_supervisor',
  'tone_shift',
  'tag',
  'pause',
] as const;
export type SentimentAction = (typeof SENTIMENT_ACTIONS)[number];

export const sentimentRuleSchema = z.object({
  metric: z.enum(SENTIMENT_METRICS),
  /** `gt` fires when metric > threshold; `lt` when metric < threshold. */
  operator: z.enum(['gt', 'lt']),
  threshold: z.number().min(-1).max(1),
  action: z.enum(SENTIMENT_ACTIONS),
  /** Don't re-fire this rule for the same call within this many seconds (debounce — self-audit F). */
  cooldownSec: z.number().int().min(1).max(3600).default(30),
  /** Action params: a tag label / a tone hint / a supervisor note. */
  tag: z.string().max(40).optional(),
  toneHint: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
});
export type SentimentRule = z.infer<typeof sentimentRuleSchema>;

export interface EvaluableRule extends SentimentRule {
  id: string;
}

export interface FiredAction {
  ruleId: string;
  action: SentimentAction;
  metric: SentimentMetric;
  value: number;
  tag?: string;
  toneHint?: string;
  note?: string;
}

function crosses(value: number, operator: 'gt' | 'lt', threshold: number): boolean {
  return operator === 'gt' ? value > threshold : value < threshold;
}

/**
 * Evaluate the sentiment signal against a rule set. A rule fires when its metric crosses its
 * threshold AND it's outside its cooldown window (last-fired > cooldownSec ago). `lastFiredAt` maps
 * ruleId → epoch-ms of the last fire for THIS call (the caller loads it from the event log). Rules
 * are evaluated in order; the result is the deterministic list of actions to dispatch now.
 */
export function evaluateSentimentRules(
  signal: SentimentSignal,
  rules: EvaluableRule[],
  lastFiredAt: Record<string, number>,
  now: number,
): FiredAction[] {
  const fired: FiredAction[] = [];
  for (const rule of rules) {
    const value = signal[rule.metric];
    if (!crosses(value, rule.operator, rule.threshold)) continue;
    const last = lastFiredAt[rule.id];
    if (last !== undefined && now - last < rule.cooldownSec * 1000) continue; // cooling down
    fired.push({
      ruleId: rule.id,
      action: rule.action,
      metric: rule.metric,
      value,
      ...(rule.tag ? { tag: rule.tag } : {}),
      ...(rule.toneHint ? { toneHint: rule.toneHint } : {}),
      ...(rule.note ? { note: rule.note } : {}),
    });
  }
  return fired;
}

/** A couple of sensible starter rules operators can clone (anger→escalate, intent→notify sales). */
export const STARTER_SENTIMENT_RULES: SentimentRule[] = [
  {
    metric: 'anger',
    operator: 'gt',
    threshold: 0.7,
    action: 'escalate',
    cooldownSec: 60,
    note: 'Angry caller — escalate to a human.',
  },
  {
    metric: 'anger',
    operator: 'gt',
    threshold: 0.5,
    action: 'alert_supervisor',
    cooldownSec: 60,
    note: 'Frustration rising.',
  },
  {
    metric: 'buyingIntent',
    operator: 'gt',
    threshold: 0.75,
    action: 'alert_supervisor',
    cooldownSec: 120,
    note: 'High buying intent — loop in sales.',
  },
  {
    metric: 'sentimentScore',
    operator: 'lt',
    threshold: -0.6,
    action: 'tone_shift',
    cooldownSec: 45,
    toneHint: 'empathetic, slower, apologetic',
  },
];
