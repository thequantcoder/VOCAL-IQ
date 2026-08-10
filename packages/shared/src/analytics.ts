import type { TranscriptSegment } from './post-call.js';

/**
 * Operator analytics (Day 41) — the pure metric core. Aggregations that read a lot of rows
 * run as SQL in the api (Timescale `time_bucket`); the functions here compute the per-call
 * conversational metrics (talk/listen, interruptions) and the derived operator numbers
 * (outcome mix, success rate, budget/anomaly evaluation) so they're deterministic + tested.
 */

// ── Conversational metrics (from transcript segments) ─────────────────────────

function speakerMs(seg: TranscriptSegment): { who: string; ms: number } {
  const who = (seg.speaker ?? seg.role ?? '').toString().toLowerCase();
  const start = seg.startMs ?? seg.ts ?? 0;
  // Segments may carry an explicit end; otherwise approximate from text length (~60ms/char).
  const end = (seg as { endMs?: number }).endMs ?? start + (seg.text ?? '').length * 60;
  return { who, ms: Math.max(0, end - start) };
}

export interface TalkListen {
  agentMs: number;
  callerMs: number;
  /** Agent share of talk time in [0,1]; 0.5 = balanced. */
  agentRatio: number;
}

/** Talk/listen split. "agent" speech vs everything else (caller/user). */
export function talkListen(segments: TranscriptSegment[]): TalkListen {
  let agentMs = 0;
  let callerMs = 0;
  for (const seg of segments) {
    const { who, ms } = speakerMs(seg);
    if (who === 'agent' || who === 'assistant' || who === 'bot') agentMs += ms;
    else callerMs += ms;
  }
  const total = agentMs + callerMs;
  return { agentMs, callerMs, agentRatio: total === 0 ? 0 : agentMs / total };
}

/**
 * Count interruptions: a speaker change where the new segment starts before the previous one
 * ended (talk-over). Requires ordered segments with start (+ end/approx). Same-speaker
 * continuations are ignored.
 */
export function countInterruptions(segments: TranscriptSegment[]): number {
  let count = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const cur = segments[i];
    if (!prev || !cur) continue;
    const prevWho = (prev.speaker ?? prev.role ?? '').toString().toLowerCase();
    const curWho = (cur.speaker ?? cur.role ?? '').toString().toLowerCase();
    if (prevWho === curWho) continue;
    const prevStart = prev.startMs ?? prev.ts ?? 0;
    const prevEnd = (prev as { endMs?: number }).endMs ?? prevStart + (prev.text ?? '').length * 60;
    const curStart = cur.startMs ?? cur.ts ?? 0;
    if (curStart < prevEnd) count++;
  }
  return count;
}

// ── Derived operator numbers ──────────────────────────────────────────────────

export interface OutcomeRow {
  status: string;
  disposition?: string | null;
}

/** Outcome mix keyed by disposition (preferred) or status. */
export function outcomeCounts(rows: OutcomeRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = (r.disposition ?? r.status ?? 'UNKNOWN').toString();
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Answered/handled calls over the total. Success = COMPLETED (a real conversation). */
export function successRate(rows: { status: string }[]): number {
  if (rows.length === 0) return 0;
  const ok = rows.filter((r) => r.status === 'COMPLETED').length;
  return ok / rows.length;
}

// ── Spend / budget monitoring ─────────────────────────────────────────────────

export interface BudgetInput {
  todaySpendUsd: number;
  monthSpendUsd: number;
  /** null = no cap configured. */
  dailyLimitUsd: number | null;
  monthlyLimitUsd: number | null;
  /** Trailing daily average (e.g. last 7 days) for anomaly detection. */
  trailingDailyAvgUsd: number;
}

export type BudgetAlertLevel = 'ok' | 'warn' | 'critical';

export interface BudgetAlert {
  metric: 'daily' | 'monthly' | 'anomaly';
  level: BudgetAlertLevel;
  message: string;
}

export interface BudgetStatus {
  todaySpendUsd: number;
  monthSpendUsd: number;
  dailyPct: number | null; // today / dailyLimit
  monthlyPct: number | null;
  anomaly: boolean; // today >> trailing average
  alerts: BudgetAlert[];
}

/** Spend crosses 80% of a cap → warn, ≥100% → critical. */
const WARN_PCT = 0.8;
/** Anomaly: today ≥ 3× the trailing average (and a non-trivial absolute amount). */
const ANOMALY_MULTIPLE = 3;
const ANOMALY_MIN_USD = 5;

/**
 * Evaluate spend against configured caps + a trailing-average anomaly check. Drives the
 * super-admin budget alerts + a per-tenant anomaly flag (distinct from per-call cost).
 */
export function evaluateBudget(input: BudgetInput): BudgetStatus {
  const alerts: BudgetAlert[] = [];
  const pct = (spend: number, limit: number | null) => (limit && limit > 0 ? spend / limit : null);
  const dailyPct = pct(input.todaySpendUsd, input.dailyLimitUsd);
  const monthlyPct = pct(input.monthSpendUsd, input.monthlyLimitUsd);

  const push = (metric: 'daily' | 'monthly', p: number | null) => {
    if (p === null) return;
    if (p >= 1)
      alerts.push({ metric, level: 'critical', message: `${metric} spend exceeded its cap` });
    else if (p >= WARN_PCT)
      alerts.push({
        metric,
        level: 'warn',
        message: `${metric} spend at ${Math.round(p * 100)}% of cap`,
      });
  };
  push('daily', dailyPct);
  push('monthly', monthlyPct);

  const anomaly =
    input.trailingDailyAvgUsd > 0 &&
    input.todaySpendUsd >= ANOMALY_MIN_USD &&
    input.todaySpendUsd >= input.trailingDailyAvgUsd * ANOMALY_MULTIPLE;
  if (anomaly) {
    alerts.push({
      metric: 'anomaly',
      level: 'warn',
      message: `today's spend is ${(input.todaySpendUsd / input.trailingDailyAvgUsd).toFixed(1)}× the recent average`,
    });
  }

  return {
    todaySpendUsd: input.todaySpendUsd,
    monthSpendUsd: input.monthSpendUsd,
    dailyPct,
    monthlyPct,
    anomaly,
    alerts,
  };
}
