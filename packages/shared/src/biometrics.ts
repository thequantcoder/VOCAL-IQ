import { z } from 'zod';

/**
 * Voice biometrics — caller identity verification by voiceprint (Day 91). The pure, deterministic
 * core shared across api/web: the match score, the verify decision (with an anti-spoof liveness gate
 * and a step-up fallback), the region-legality allowlist, the consent gate, and the schemas.
 *
 * Biometric data is among the MOST sensitive PII and is heavily regulated (BIPA, GDPR Art. 9, etc.),
 * so this core is DEFAULT-DENY by construction (self-audit C):
 *  - Region legality: a region is allowed ONLY if the tenant explicitly lists it — an empty allowlist
 *    denies everywhere. Biometrics never run in a region the tenant hasn't affirmatively enabled.
 *  - Consent: enrollment REQUIRES explicit biometric consent (`consent === true`); there is no path
 *    to enroll a voiceprint without it.
 *  - Anti-spoofing: a verification below the liveness floor is a SPOOF — never a pass, regardless of
 *    how well the voiceprint matches (a replayed recording can match but won't be live).
 * The raw voiceprint (embedding) is NEVER represented here as anything but an opaque number[]; the
 * service encrypts it at rest and never returns it. Everything here unit-tests without a model or DB.
 */

// ── Match score (pure) ───────────────────────────────────────────────────────────

export const MIN_EMBEDDING_DIMS = 16;
export const MAX_EMBEDDING_DIMS = 4096;

/** Is this a usable voiceprint embedding? A fixed-length, finite, non-zero numeric vector. Pure. */
export function isValidEmbedding(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length < MIN_EMBEDDING_DIMS || v.length > MAX_EMBEDDING_DIMS) {
    return false;
  }
  let nonZero = false;
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return false;
    if (x !== 0) nonZero = true;
  }
  return nonZero;
}

/**
 * Cosine similarity mapped to a 0..1 match score (a negative cosine → 0). Returns 0 for a dimension
 * mismatch or a degenerate (zero-norm) vector — never throws, never a false high score. Pure.
 */
export function matchScore(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Math.max(0, Math.min(1, cos));
}

// ── Verify decision (pure — anti-spoof + threshold + step-up) ──────────────────────

export const DEFAULT_MATCH_THRESHOLD = 0.75;
export const DEFAULT_MIN_LIVENESS = 0.5;

/** The verification outcome. `spoof` = failed liveness; `step_up` = live but below threshold. */
export type VerifyOutcome = 'verified' | 'step_up' | 'spoof';

export interface VerifyDecision {
  outcome: VerifyOutcome;
  verified: boolean;
  /** True when the caller should be routed to a secondary factor (live but not confidently matched). */
  needsStepUp: boolean;
  score: number;
  liveness: number;
}

/**
 * Decide a verification. Liveness is checked FIRST (anti-spoofing, self-audit C): a sample below the
 * liveness floor is a spoof and can never verify, even at a perfect score. A live sample verifies at
 * or above the threshold; otherwise it falls back to step-up auth (never a hard pass). Pure.
 */
export function verifyDecision(input: {
  score: number;
  liveness: number;
  threshold?: number;
  minLiveness?: number;
}): VerifyDecision {
  const threshold = input.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const minLiveness = input.minLiveness ?? DEFAULT_MIN_LIVENESS;
  const score = Math.max(0, Math.min(1, input.score));
  const liveness = Math.max(0, Math.min(1, input.liveness));

  if (liveness < minLiveness) {
    return { outcome: 'spoof', verified: false, needsStepUp: true, score, liveness };
  }
  if (score >= threshold) {
    return { outcome: 'verified', verified: true, needsStepUp: false, score, liveness };
  }
  return { outcome: 'step_up', verified: false, needsStepUp: true, score, liveness };
}

// ── Region legality (pure — DEFAULT DENY) ─────────────────────────────────────────

/**
 * Is voiceprint processing legal to run for this region under the tenant's policy? DEFAULT DENY: a
 * region is allowed ONLY if it appears in the tenant's explicit allowlist (case-insensitive). An
 * empty allowlist denies everywhere. Biometrics are heavily regulated — the platform never assumes
 * a region is permitted. Pure.
 */
export function isBiometricRegionAllowed(region: string, allowedRegions: string[]): boolean {
  const r = region.trim().toUpperCase();
  if (!r) return false;
  return allowedRegions.map((a) => a.trim().toUpperCase()).includes(r);
}

// ── Schemas ────────────────────────────────────────────────────────────────────────

/** Per-tenant biometric policy. `enabled` is OFF by default; `allowedRegions` is deny-by-default. */
export const biometricSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Explicit region allowlist (e.g. ["US-NY","GB"]). Empty → biometrics denied everywhere. */
  allowedRegions: z.array(z.string().min(2).max(10)).max(200).default([]),
  threshold: z.number().min(0.5).max(0.999).default(DEFAULT_MATCH_THRESHOLD),
  minLiveness: z.number().min(0).max(1).default(DEFAULT_MIN_LIVENESS),
  /** Days to retain an enrolled voiceprint before the retention sweep erases it. */
  retentionDays: z.number().int().min(1).max(3650).default(365),
});
export type BiometricSettings = z.infer<typeof biometricSettingsSchema>;

/** Enrollment requires explicit biometric consent — `consent` must be literally `true`. */
export const enrollInputSchema = z.object({
  contactId: z.string().min(1).max(200),
  region: z.string().min(2).max(10),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Explicit biometric consent is required to enroll a voiceprint.' }),
  }),
  /** An opaque reference to the captured audio (the provider turns it into an embedding + liveness). */
  sample: z.string().min(1).max(20000),
});
export type EnrollInput = z.infer<typeof enrollInputSchema>;

export const verifyInputSchema = z.object({
  contactId: z.string().min(1).max(200),
  region: z.string().min(2).max(10),
  sample: z.string().min(1).max(20000),
});
export type VerifyInput = z.infer<typeof verifyInputSchema>;

/** Audit event kinds — every biometric action is logged (self-audit C/E). */
export const BIOMETRIC_EVENTS = ['enroll', 'verify', 'erase'] as const;
export type BiometricEvent = (typeof BIOMETRIC_EVENTS)[number];
