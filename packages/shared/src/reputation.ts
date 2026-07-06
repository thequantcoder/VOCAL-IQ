import { z } from 'zod';

/**
 * Caller reputation, branded caller ID & STIR/SHAKEN (Day 69) — pure scoring + auto-remediation
 * shared across api/voice. Protecting answer rates is EXISTENTIAL: if carriers label a number
 * "Scam Likely", pickup collapses. This module scores a number's health from spam signals, decides
 * when to rest/rotate a flagged number, and enforces a warm-up ramp on new numbers. The live
 * attestation + reputation lookups go through provider seams (gated); the logic here is testable.
 */

/** STIR/SHAKEN attestation levels — A (full) is the strongest anti-spoofing signal. */
export const ATTESTATION_LEVELS = ['A', 'B', 'C', 'none'] as const;
export type AttestationLevel = (typeof ATTESTATION_LEVELS)[number];
export const attestationSchema = z.enum(ATTESTATION_LEVELS);

export type SpamLabel = 'clean' | 'at_risk' | 'flagged';

export interface ReputationSignals {
  /** Provider/3rd-party spam label if known. */
  spamLabel?: SpamLabel;
  /** Fraction (0–1) of recent calls that were very short (spam-drop signature). */
  shortCallRatio: number;
  /** Fraction (0–1) of recent calls the callee blocked/reported. */
  blockRatio: number;
  /** Best attestation the number is currently getting on outbound. */
  attestation: AttestationLevel;
  /** Calls placed today (for pace assessment). */
  callsToday: number;
}

export interface ReputationResult {
  score: number; // 0–100, higher = healthier
  label: SpamLabel;
  reasons: string[];
}

/**
 * Score a number's reputation. Starts at 100 and deducts for spam signals; a provider "flagged"
 * label caps the score low. The label bands the score for the health UI + remediation.
 */
export function scoreReputation(s: ReputationSignals): ReputationResult {
  const reasons: string[] = [];
  let score = 100;

  if (s.spamLabel === 'flagged') {
    score = Math.min(score, 20);
    reasons.push('carrier spam label: flagged');
  } else if (s.spamLabel === 'at_risk') {
    score -= 25;
    reasons.push('carrier spam label: at risk');
  }
  if (s.blockRatio >= 0.1) {
    score -= Math.round(s.blockRatio * 100);
    reasons.push('callees blocking/reporting');
  }
  if (s.shortCallRatio >= 0.6) {
    score -= 20;
    reasons.push('high short-call ratio (drop signature)');
  }
  if (s.attestation === 'C' || s.attestation === 'none') {
    score -= 10;
    reasons.push('weak STIR/SHAKEN attestation');
  }

  score = Math.max(0, Math.min(100, score));
  const label: SpamLabel = score < 40 ? 'flagged' : score < 70 ? 'at_risk' : 'clean';
  return { score, label, reasons };
}

/**
 * Decide whether to REST (temporarily stop using) a number. A flagged number, or one below the
 * rest threshold, is rested to let its reputation recover; returns the rest window in hours.
 */
export function restDecision(
  result: ReputationResult,
  restThreshold = 40,
): { rest: boolean; hours: number } {
  if (result.label === 'flagged' || result.score < restThreshold) {
    // Deeper damage → longer rest.
    return { rest: true, hours: result.score < 20 ? 72 : 24 };
  }
  return { rest: false, hours: 0 };
}

/**
 * Warm-up ramp for a new number: gradually raise the daily call cap over the first two weeks so a
 * fresh number builds reputation instead of tripping carrier spam heuristics with a cold blast.
 * Returns the max calls allowed today given the number's age.
 */
export function warmupDailyCap(ageDays: number, targetDailyCap = 500): number {
  if (ageDays >= 14) return targetDailyCap;
  // Day 0 ≈ 20, doubling-ish to the target by day 14.
  const ramp = [20, 30, 50, 80, 120, 180, 250, 320, 380, 430, 465, 485, 495, 500];
  const cap = ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(ageDays)))]!;
  return Math.min(cap, targetDailyCap);
}

export interface NumberHealth {
  id: string;
  e164: string;
  score: number;
  label: SpamLabel;
  restedUntil: number | null; // epoch ms
  ageDays: number;
}

/** Pick the healthiest currently-usable number to dial from (rotation away from flagged ones). */
export function pickHealthyNumber(numbers: NumberHealth[], now: number): NumberHealth | null {
  const usable = numbers.filter((n) => !n.restedUntil || n.restedUntil <= now);
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => b.score - a.score)[0]!;
}

/** Branded caller ID (CNAM / Rich Call Data) config a tenant registers per number. */
export const brandedCallerIdSchema = z.object({
  displayName: z.string().trim().min(1).max(32), // CNAM is ~15 chars on many carriers
  logoUrl: z.string().url().optional(),
  callReason: z.string().trim().max(80).optional(),
});
export type BrandedCallerId = z.infer<typeof brandedCallerIdSchema>;
