import { z } from 'zod';

/**
 * Advanced dialer modes (Day 79) — the pure pacing engine shared across workers/api/web.
 *
 * Call-center-grade dialing for human+AI blended teams: given how many agents are free, how many
 * calls are already in flight, the recent answer rate, and the recent abandon rate, decide how many
 * NEW calls to place this tick. The caller feeds the result into `selectDueContacts` (which enforces
 * the concurrency cap), so this stays a pure, exhaustively-testable decision.
 *
 * Two properties are non-negotiable and encoded here:
 *  - C (compliance, self-audit C): PREDICTIVE over-dials to keep agents busy, but the moment the
 *    measured abandon rate reaches the legal cap (TCPA-style, default 3%) it falls back to safe 1:1
 *    pacing — the dialer can never knowingly exceed the abandon cap.
 *  - F (pacing under load, self-audit F): the budget is always clamped to the hard per-tick pace AND
 *    the remaining concurrency, so no backlog or bad input can produce a dialing storm.
 */

/** progressive = 1:1 (one call per free agent); power = N:1; predictive = pace to answer-rate. */
export const DIALER_MODES = ['progressive', 'power', 'predictive'] as const;
export type DialerMode = (typeof DIALER_MODES)[number];

export const dialerConfigSchema = z.object({
  mode: z.enum(DIALER_MODES).default('progressive'),
  /** true = pace to free HUMAN agents (Agent Desk, Day 67); false = pure-AI (pace to concurrency). */
  blended: z.boolean().default(false),
  /** POWER ratio — calls per free agent (e.g. 2 = 2:1). Ignored by progressive. */
  linesPerAgent: z.number().min(1).max(5).default(1),
  /** Legal abandon-rate cap (predictive throttles below this — self-audit C). */
  maxAbandonRatePercent: z.number().min(0).max(100).default(3),
  /** Floor on the answer rate used by predictive, so a tiny/cold-start rate can't over-dial. */
  minAnswerRatePercent: z.number().min(1).max(100).default(20),
});
export type DialerConfig = z.infer<typeof dialerConfigSchema>;

/** The default config (progressive, pure-AI) — what a campaign with no dialer config resolves to. */
export const DEFAULT_DIALER_CONFIG: DialerConfig = dialerConfigSchema.parse({});

/** Parse a stored blob (Campaign.dialerConfig JSON) into a valid config, falling back to defaults. */
export function parseDialerConfig(raw: unknown): DialerConfig {
  const parsed = dialerConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_DIALER_CONFIG;
}

export interface DialCapacity {
  /** Free agent slots this tick — free HUMAN agents (blended) or AI concurrency (pure-AI). */
  freeAgents: number;
  /** Calls already placed but not yet connected/terminal (they will consume capacity when answered). */
  inFlight: number;
  /** Hard max simultaneous calls for the campaign. */
  concurrency: number;
  /** Hard max NEW calls to launch this tick (the abuse/cost guard). */
  pacePerTick: number;
}

export interface DialStats {
  /** Recent connect rate 0..100 (answered / dialed). */
  answerRatePercent: number;
  /** Recent abandon rate 0..100 (connected-but-no-agent / connected). */
  abandonRatePercent: number;
  /**
   * Whether the abandon rate is a REAL, live measurement. Predictive over-dialing is only compliant
   * while abandonment is actually monitored, so when this is false predictive stays at safe 1:1
   * pacing (the guardrail fails SAFE, never over-dialing blind — self-audit C).
   */
  abandonFeedLive: boolean;
}

/** Abandon rate as a percentage — abandoned (connected with no agent free) over connected calls. */
export function abandonRatePercent(abandoned: number, connected: number): number {
  if (connected <= 0) return 0;
  return (abandoned / connected) * 100;
}

/** Is the abandon rate within the legal cap? (self-audit C). */
export function withinAbandonCap(ratePercent: number, capPercent: number): boolean {
  return ratePercent <= capPercent;
}

/**
 * How many NEW calls to place this tick for the given dialer mode. `desired` is the ideal count for
 * the mode; the actual budget subtracts in-flight calls and is clamped to the hard per-tick pace and
 * the remaining concurrency (so it can never storm — self-audit F). Predictive falls back to safe 1:1
 * once the abandon rate reaches the cap (self-audit C). Pure + deterministic.
 */
export function computeDialBudget(
  cap: DialCapacity,
  stats: DialStats,
  config: DialerConfig,
): number {
  const free = Math.max(0, cap.freeAgents);
  let desired: number;
  switch (config.mode) {
    case 'progressive':
      desired = free; // 1:1
      break;
    case 'power':
      desired = Math.floor(free * config.linesPerAgent); // N:1
      break;
    case 'predictive': {
      // Over-dial ONLY while abandonment is actually being monitored AND is under the cap. Without a
      // live abandon feed, or once the cap is reached, fall back to safe 1:1 — the compliance
      // guardrail fails SAFE and never over-dials blind (self-audit C).
      const monitored = stats.abandonFeedLive;
      const underCap = stats.abandonRatePercent < config.maxAbandonRatePercent;
      if (!monitored || !underCap) {
        desired = free;
        break;
      }
      // Over-dial so expected connects ≈ free agents, using the recent answer rate (floored).
      const answer = Math.max(config.minAnswerRatePercent, stats.answerRatePercent) / 100;
      desired = Math.ceil(free / answer);
      break;
    }
    default:
      desired = free;
  }
  const target = desired - cap.inFlight;
  const hardCap = Math.min(cap.pacePerTick, Math.max(0, cap.concurrency - cap.inFlight));
  return Math.max(0, Math.min(target, hardCap));
}
