import { z } from 'zod';

/**
 * Voice-loop latency model (Day 63) — pure SLO evaluation, percentiles, endpointing tuning, and
 * latency-based provider selection shared across api/voice. Perceived latency is the sum of the
 * turn stages: STT finalization → LLM time-to-first-token → TTS time-to-first-audio → network.
 * Keeping the budgets + math pure makes SLOs enforceable + regression-testable in CI (self-audit
 * F), and lets the router pick the fastest provider from measured stats (self-audit D).
 */

export const LATENCY_STAGES = ['stt', 'llmTtft', 'ttsTtfa', 'network'] as const;
export type LatencyStage = (typeof LATENCY_STAGES)[number];

/** A single turn's measured stage timings (ms). */
export const latencySampleSchema = z.object({
  stt: z.number().min(0).max(60_000),
  llmTtft: z.number().min(0).max(60_000),
  ttsTtfa: z.number().min(0).max(60_000),
  network: z.number().min(0).max(60_000),
  provider: z.string().max(40).optional(),
  region: z.string().max(40).optional(),
});
export type LatencySample = z.infer<typeof latencySampleSchema>;

/**
 * Per-stage + total latency SLOs (ms). Targets are the p95 the loop must hold to feel natural — a
 * sub-1s turnaround. These are the CI-guarded thresholds; a regression that pushes the modelled
 * p95 over budget fails the build.
 */
export const LATENCY_SLO = {
  stt: 300,
  llmTtft: 400,
  ttsTtfa: 300,
  network: 150,
  /** End-to-end turn budget (perceived response time). */
  total: 1000,
} as const;

export function sampleTotal(s: Pick<LatencySample, LatencyStage>): number {
  return s.stt + s.llmTtft + s.ttsTtfa + s.network;
}

/** Nearest-rank percentile (0–100) of a numeric series. Empty → 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

export interface LatencyStat {
  stage: LatencyStage | 'total';
  p50: number;
  p95: number;
  slo: number;
  breached: boolean;
}

/** Compute p50/p95 per stage + total over samples and flag SLO breaches (p95 > budget). */
export function summarizeLatency(samples: LatencySample[]): {
  stats: LatencyStat[];
  breached: boolean;
  count: number;
} {
  const stages: (LatencyStage | 'total')[] = [...LATENCY_STAGES, 'total'];
  const series = (stage: LatencyStage | 'total') =>
    samples.map((s) => (stage === 'total' ? sampleTotal(s) : s[stage]));
  const stats = stages.map((stage) => {
    const vals = series(stage);
    const slo = LATENCY_SLO[stage];
    const p95 = percentile(vals, 95);
    return { stage, p50: percentile(vals, 50), p95, slo, breached: p95 > slo };
  });
  return { stats, breached: stats.some((s) => s.breached), count: samples.length };
}

// ── Endpointing / turn-taking tuning ─────────────────────────────────────────

/**
 * Endpointing config per use case: how long of a pause ends the caller's turn. Shorter = snappier
 * but risks cutting people off; longer = safer but adds dead air. Tuned per use case.
 */
export const ENDPOINTING_PRESETS = {
  // Fast back-and-forth (support, qualification): cut dead air aggressively.
  snappy: { silenceMs: 500, minSpeechMs: 120, punctuationBonusMs: 150 },
  // Balanced default.
  balanced: { silenceMs: 700, minSpeechMs: 150, punctuationBonusMs: 200 },
  // Give thinking room (surveys, complex answers): avoid interrupting.
  patient: { silenceMs: 1100, minSpeechMs: 200, punctuationBonusMs: 250 },
} as const;
export type EndpointingPreset = keyof typeof ENDPOINTING_PRESETS;

/**
 * Decide whether the caller's turn has ended. The effective silence threshold shrinks when the
 * last token looked terminal (ended in sentence punctuation) so the agent replies sooner without
 * clipping mid-sentence pauses.
 */
export function turnEnded(
  args: { silenceMs: number; speechMs: number; endedWithPunctuation: boolean },
  preset: EndpointingPreset = 'balanced',
): boolean {
  const cfg = ENDPOINTING_PRESETS[preset];
  if (args.speechMs < cfg.minSpeechMs) return false; // ignore blips / noise
  const threshold = cfg.silenceMs - (args.endedWithPunctuation ? cfg.punctuationBonusMs : 0);
  return args.silenceMs >= threshold;
}

// ── Latency-based provider selection ─────────────────────────────────────────

export interface ProviderLatency {
  provider: string;
  p95: number;
  /** Relative cost weight (1 = baseline). Lets routing trade a little latency for cost. */
  costWeight?: number;
}

/**
 * Pick the provider with the best latency, optionally trading latency for cost: the score is
 * `p95 * (1 + costBias*(costWeight-1))`. costBias 0 = pure latency; higher = weigh cost more.
 * Deterministic — ties broken by input order (self-audit D: an explicit, testable trade-off).
 */
export function pickProviderByLatency(candidates: ProviderLatency[], costBias = 0): string | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestScore = score(best, costBias);
  for (const c of candidates.slice(1)) {
    const s = score(c, costBias);
    if (s < bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best.provider;
}

function score(c: ProviderLatency, costBias: number): number {
  const cost = c.costWeight ?? 1;
  return c.p95 * (1 + costBias * (cost - 1));
}
