import { z } from 'zod';
import { type AbuseSignals, type AbuseVerdict, evaluateAbuse } from './abuse.js';

/**
 * Real-time fraud/abuse enforcement (Day 70) — the pure decision layer on top of the Day-64 abuse
 * scoring. Given a tenant's abuse verdict + extended fraud signals, decide the AUTOMATED RESPONSE
 * (throttle → pause campaigns → suspend tenant → kill a number) and whether a human review is
 * required before service resumes. Keeping it pure makes the escalation ladder deterministic +
 * testable; the API applies the action + opens a review case. No PII in the signals.
 */

/** Fraud signals that augment the Day-64 abuse signals (DNC/content/geo). */
export interface FraudSignals extends AbuseSignals {
  /** Fraction (0–1) of recent dials that hit the DNC/suppression list — attempted violations. */
  dncHitRatio: number;
  /** Count of banned-content matches in recent transcripts (scam scripts, etc.). */
  bannedContentHits: number;
  /** Distinct destination countries in the window — a sudden geo spread is anomalous. */
  distinctCountries: number;
}

export type EnforcementAction = 'allow' | 'throttle' | 'pause_campaigns' | 'suspend_tenant';

export const fraudPolicySchema = z.object({
  /** Composite score at/above which to suspend the tenant (review required to resume). */
  suspendScore: z.number().int().min(0).max(100).default(85),
  /** Score to pause running campaigns (softer than a full suspend). */
  pauseScore: z.number().int().min(0).max(100).default(70),
  /** Score to throttle. */
  throttleScore: z.number().int().min(0).max(100).default(45),
  /** New tenants placing more than this many calls/day must be KYC-verified first. */
  kycVolumeThreshold: z.number().int().min(1).default(200),
});
export type FraudPolicy = z.infer<typeof fraudPolicySchema>;

export interface FraudDecision {
  score: number;
  action: EnforcementAction;
  /** True when a human must review before service resumes (suspend). */
  reviewRequired: boolean;
  reasons: string[];
}

/**
 * Escalate a fraud verdict into an enforcement action. Extra fraud signals ADD risk on top of the
 * base abuse score (DNC-violation attempts, banned content, and a sudden multi-country spread are
 * strong fraud tells). The highest band the score reaches wins; a suspend always requires review.
 */
export function decideFraudResponse(signals: FraudSignals, policy: FraudPolicy): FraudDecision {
  const base: AbuseVerdict = evaluateAbuse(signals, {
    maxCallsPerMinute: 30,
    maxCallsPerHour: 500,
    blockScore: 70,
    warnScore: 40,
  });
  const reasons = [...base.reasons];
  let score = base.score;

  if (signals.dncHitRatio >= 0.05) {
    reasons.push('repeated DNC/suppression hits (violation attempts)');
    score += 30;
  }
  if (signals.bannedContentHits > 0) {
    reasons.push(`banned-content matches (${signals.bannedContentHits})`);
    score += 25;
  }
  if (signals.distinctCountries >= 5 && signals.callsLastHour >= 20) {
    reasons.push('sudden multi-country calling spread');
    score += 15;
  }
  score = Math.min(100, score);

  let action: EnforcementAction;
  if (score >= policy.suspendScore) action = 'suspend_tenant';
  else if (score >= policy.pauseScore) action = 'pause_campaigns';
  else if (score >= policy.throttleScore) action = 'throttle';
  else action = 'allow';

  return { score, action, reviewRequired: action === 'suspend_tenant', reasons };
}

/**
 * KYC gate: a NEW tenant scaling past the volume threshold must be KYC-verified first. Returns
 * whether scaling is allowed + why. Established or verified tenants pass.
 */
export function kycGate(
  args: { kycVerified: boolean; accountAgeDays: number; callsLastHour: number },
  policy: FraudPolicy,
): { allowed: boolean; reason?: string } {
  const highVolume = args.callsLastHour >= policy.kycVolumeThreshold;
  if (highVolume && !args.kycVerified && args.accountAgeDays < 14) {
    return { allowed: false, reason: 'KYC verification required before scaling volume' };
  }
  return { allowed: true };
}

export const CASE_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
