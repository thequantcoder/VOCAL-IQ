import { z } from 'zod';
import { LeadStatus } from './enums.js';

/**
 * Lead intelligence pure logic (Day 29): auto Hot/Warm/Cold scoring from a call's
 * intent + sentiment + outcome, dynamic-variable injection into agent scripts, and the
 * pipeline stage machine. Kept pure so scoring (self-audit A) is deterministic + fully
 * unit-tested; the API applies it post-call and the workspace renders it.
 */

// ── Scoring ─────────────────────────────────────────────────────────────────────

/** Temperature buckets the score maps to (a subset of LeadStatus). */
export type LeadTemperature =
  | typeof LeadStatus.HOT
  | typeof LeadStatus.WARM
  | typeof LeadStatus.COLD;

export const leadSignalsSchema = z.object({
  // Classified buyer intent for the call (0..1 confidence folds into the weight).
  intent: z
    .enum(['ready', 'interested', 'neutral', 'not_interested', 'unknown'])
    .default('unknown'),
  sentiment: z.enum(['positive', 'neutral', 'negative']).default('neutral'),
  outcome: z
    .enum(['booked', 'completed', 'callback', 'no_answer', 'voicemail', 'declined', 'failed'])
    .default('failed'),
  // Engagement proxy: talk time in seconds (longer = more engaged, capped).
  talkSeconds: z.number().min(0).max(36_000).default(0),
});
export type LeadSignals = z.infer<typeof leadSignalsSchema>;

const INTENT_POINTS: Record<LeadSignals['intent'], number> = {
  ready: 50,
  interested: 35,
  neutral: 15,
  not_interested: 0,
  unknown: 10,
};
const SENTIMENT_POINTS: Record<LeadSignals['sentiment'], number> = {
  positive: 25,
  neutral: 12,
  negative: 0,
};
const OUTCOME_POINTS: Record<LeadSignals['outcome'], number> = {
  booked: 25,
  completed: 18,
  callback: 15,
  voicemail: 6,
  no_answer: 3,
  declined: 0,
  failed: 0,
};

/**
 * Score a lead 0–100 from the call signals and bucket it Hot/Warm/Cold. Weights: intent
 * (≤50) dominates, then sentiment (≤25) and outcome (≤25), with a small engagement nudge
 * from talk time. Deterministic + monotonic so the same call always scores the same.
 */
export function scoreLead(input: unknown): { score: number; temperature: LeadTemperature } {
  const s = leadSignalsSchema.parse(input ?? {});
  const engagement = Math.min(10, Math.round(s.talkSeconds / 30)); // up to +10 for ~5min+
  const raw = INTENT_POINTS[s.intent] + SENTIMENT_POINTS[s.sentiment] + OUTCOME_POINTS[s.outcome];
  const score = Math.max(0, Math.min(100, raw + engagement - 10)); // -10 baseline so cold≈0
  const temperature: LeadTemperature =
    score >= 65 ? LeadStatus.HOT : score >= 35 ? LeadStatus.WARM : LeadStatus.COLD;
  return { score, temperature };
}

// ── Dynamic variables (personalise agent scripts at call time) ───────────────────

/**
 * Render `{{var}}` placeholders in a script/template with a lead's dynamic variables.
 * Unknown placeholders resolve to `fallback` (default '') so a missing field never leaks
 * a raw `{{token}}` to the caller. Values are stringified; keys are trimmed.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, unknown>,
  fallback = '',
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key.trim()];
    return v === undefined || v === null ? fallback : String(v);
  });
}

/** The variable names referenced by a template (for validation / UI hints). */
export function templateVariables(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    names.add((m[1] as string).trim());
  }
  return [...names];
}

// ── Pipeline stage machine ──────────────────────────────────────────────────────

/** The Quick-CRM kanban columns (ordered). `pipelineStage` on a Lead holds one of these. */
export const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'BOOKED', 'LOST'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

const STAGE_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'BOOKED', 'LOST', 'NEW'],
  QUALIFIED: ['BOOKED', 'LOST', 'CONTACTED'],
  BOOKED: ['LOST', 'QUALIFIED'],
  LOST: ['NEW'], // reopen
};

export function isValidStage(stage: string): stage is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(stage);
}

/** Whether a lead may move from `from` to `to` in the pipeline. */
export function canTransition(from: string, to: string): boolean {
  if (!isValidStage(to)) return false;
  if (!isValidStage(from)) return true; // unset/legacy → allow entering any stage
  if (from === to) return true;
  return STAGE_TRANSITIONS[from].includes(to);
}
