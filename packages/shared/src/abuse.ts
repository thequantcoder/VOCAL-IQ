import { z } from 'zod';

/**
 * Abuse / anti-spam-robocall detection (Day 64) — pure risk scoring shared across api/workers.
 * Given a window of a tenant's recent calling behaviour, produce a risk score + the reasons, so
 * the platform can throttle, require KYC, or auto-suppress before a spam/robocall pattern causes
 * carrier or reputational damage (self-audit C). Pure + exhaustively testable; the API applies the
 * verdict. No PII in the signals — counts + ratios only.
 */

export interface AbuseSignals {
  /** Calls placed in the trailing short window (e.g. last minute) — burst detection. */
  callsLastMinute: number;
  /** Calls placed in the trailing hour — sustained-volume detection. */
  callsLastHour: number;
  /** Distinct destinations in the hour — few distinct + high volume ⇒ hammering. */
  distinctDestinations: number;
  /** Fraction (0–1) of recent calls under a few seconds — robocall/voicemail-drop signature. */
  shortCallRatio: number;
  /** Fraction (0–1) of recent calls that failed/were rejected — bad-number sweeping. */
  failureRatio: number;
  /** Account age in days — brand-new accounts blasting volume are high-risk. */
  accountAgeDays: number;
  /** Is the tenant KYC-verified? Unverified + volume ⇒ higher risk. */
  kycVerified: boolean;
}

export const abusePolicySchema = z.object({
  maxCallsPerMinute: z.number().int().min(1).max(1000).default(30),
  maxCallsPerHour: z.number().int().min(1).max(50_000).default(500),
  /** Above this risk score (0–100) → block; between warn and block → throttle. */
  blockScore: z.number().int().min(0).max(100).default(70),
  warnScore: z.number().int().min(0).max(100).default(40),
});
export type AbusePolicy = z.infer<typeof abusePolicySchema>;

export type AbuseAction = 'allow' | 'throttle' | 'block';

export interface AbuseVerdict {
  score: number; // 0–100
  action: AbuseAction;
  reasons: string[];
}

/**
 * Score a tenant's calling behaviour. Each heuristic adds weighted risk; the total is clamped to
 * 100. Hard velocity-cap breaches force a block regardless of the composite score. The mapping
 * from score → action uses the policy thresholds.
 */
export function evaluateAbuse(signals: AbuseSignals, policy: AbusePolicy): AbuseVerdict {
  const reasons: string[] = [];
  let score = 0;

  // Burst rate (last minute).
  if (signals.callsLastMinute > policy.maxCallsPerMinute) {
    reasons.push('per-minute velocity cap exceeded');
    score += 45;
  } else if (signals.callsLastMinute > policy.maxCallsPerMinute * 0.7) {
    reasons.push('approaching per-minute velocity cap');
    score += 15;
  }

  // Sustained hourly volume.
  if (signals.callsLastHour > policy.maxCallsPerHour) {
    reasons.push('hourly volume cap exceeded');
    score += 30;
  }

  // Hammering few destinations at high volume.
  if (signals.callsLastHour >= 20 && signals.distinctDestinations <= 3) {
    reasons.push('high volume to very few destinations');
    score += 20;
  }

  // Robocall / voicemail-drop signature: mostly very short calls.
  if (signals.callsLastHour >= 10 && signals.shortCallRatio >= 0.7) {
    reasons.push('high ratio of very short calls (robocall signature)');
    score += 25;
  }

  // Bad-number sweeping.
  if (signals.callsLastHour >= 10 && signals.failureRatio >= 0.5) {
    reasons.push('high failure ratio (number sweeping)');
    score += 15;
  }

  // New, unverified account blasting volume.
  if (!signals.kycVerified && signals.accountAgeDays < 3 && signals.callsLastHour >= 20) {
    reasons.push('new unverified account with high volume');
    score += 25;
  }

  score = Math.min(100, score);

  // Hard cap breach always blocks, whatever the composite.
  const hardBreach =
    signals.callsLastMinute > policy.maxCallsPerMinute ||
    signals.callsLastHour > policy.maxCallsPerHour;

  let action: AbuseAction;
  if (hardBreach || score >= policy.blockScore) action = 'block';
  else if (score >= policy.warnScore) action = 'throttle';
  else action = 'allow';

  return { score, action, reasons };
}
