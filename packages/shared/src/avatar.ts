import { z } from 'zod';

/**
 * Digital-human / video-avatar agents (Day 92) — the pure, deterministic core shared across api/web.
 *
 * A photoreal/animated avatar speaks the agent's responses on video (web widget / video channel). Video
 * is EXPENSIVE and likeness is sensitive, so the rules that matter are encoded here as pure decisions:
 *  - D (cost): video is metered per second; a session's cost is `seconds × ratePerSec` — deterministic.
 *  - Plan-gating + graceful fallback (self-audit D/F): video runs ONLY when the plan entitles it, a
 *    provider is ready, and an avatar is selected — otherwise the session AUTO-FALLS BACK to voice-only
 *    (never an error; the caller is still served). `decideMode` is the single source of that truth.
 *  - C (likeness consent): a `custom` avatar is a real person's likeness → it requires explicit consent
 *    to create; a stock avatar does not. `requiresLikenessConsent` encodes it.
 * Everything here unit-tests without a provider or DB.
 */

// ── Avatar catalog ───────────────────────────────────────────────────────────────

export const AVATAR_KINDS = ['stock', 'custom'] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

/** A `custom` avatar is a real person's likeness and REQUIRES explicit consent to create. Pure. */
export function requiresLikenessConsent(kind: AvatarKind): boolean {
  return kind === 'custom';
}

export const avatarInputSchema = z.object({
  name: z.string().min(1).max(120),
  provider: z.string().min(1).max(60).default('mock'),
  /** The provider's id for the avatar/actor (opaque to us). */
  providerAvatarId: z.string().min(1).max(200),
  kind: z.enum(AVATAR_KINDS).default('stock'),
  /** Must be true to create a `custom` (real-likeness) avatar; ignored for stock. */
  likenessConsent: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type AvatarInput = z.infer<typeof avatarInputSchema>;

// ── Session mode + graceful fallback (self-audit D/F) ─────────────────────────────

export type AvatarMode = 'video' | 'voice';
export type FallbackReason = 'plan' | 'provider_unavailable' | 'no_avatar';

export interface ModeDecision {
  mode: AvatarMode;
  fallback: boolean;
  reason?: FallbackReason;
}

/**
 * Decide whether a session runs as VIDEO or falls back to voice-only. Order: an explicit voice request
 * stays voice; otherwise video requires the plan entitlement AND a ready provider AND a selected avatar
 * — any missing piece degrades gracefully to voice (never an error). Pure + deterministic.
 */
export function decideMode(input: {
  requestVideo: boolean;
  planAllowsVideo: boolean;
  providerReady: boolean;
  avatarSelected: boolean;
}): ModeDecision {
  if (!input.requestVideo) return { mode: 'voice', fallback: false };
  if (!input.planAllowsVideo) return { mode: 'voice', fallback: true, reason: 'plan' };
  if (!input.providerReady)
    return { mode: 'voice', fallback: true, reason: 'provider_unavailable' };
  if (!input.avatarSelected) return { mode: 'voice', fallback: true, reason: 'no_avatar' };
  return { mode: 'video', fallback: false };
}

// ── Cost (self-audit D — video is expensive) ──────────────────────────────────────

/** Illustrative default video-avatar rate ($/second). Real rates come from the provider price table. */
export const DEFAULT_VIDEO_RATE_PER_SEC = 0.02;
/** Hard cap on a single session's billable seconds (a runaway-cost backstop). */
export const MAX_SESSION_SECONDS = 4 * 60 * 60; // 4h

/** Metered video cost for a session, rounded to whole cents. Voice-only → 0. Pure + deterministic. */
export function estimateVideoCost(
  mode: AvatarMode,
  seconds: number,
  ratePerSec: number = DEFAULT_VIDEO_RATE_PER_SEC,
): number {
  if (mode !== 'video') return 0;
  const s = Math.max(0, Math.min(MAX_SESSION_SECONDS, Math.floor(seconds)));
  return Math.round(s * ratePerSec * 100) / 100;
}

/** Clamp appended seconds to the session cap so cost can never run away. Pure. */
export function clampSeconds(current: number, add: number): number {
  return Math.max(0, Math.min(MAX_SESSION_SECONDS, current + Math.max(0, Math.floor(add))));
}

// ── Plan feature ─────────────────────────────────────────────────────────────────

/** The plan feature key that entitles a tenant to video avatars. */
export const VIDEO_AVATAR_FEATURE = 'videoAvatar';

/** Does this plan's feature map entitle video avatars? Pure. */
export function planAllowsVideoAvatar(features: Record<string, unknown>): boolean {
  return features[VIDEO_AVATAR_FEATURE] === true;
}

// ── Session status ───────────────────────────────────────────────────────────────

export const AVATAR_SESSION_STATUSES = ['active', 'ended'] as const;
export type AvatarSessionStatus = (typeof AVATAR_SESSION_STATUSES)[number];

export const startAvatarSessionSchema = z.object({
  agentId: z.string().uuid().optional(),
  avatarId: z.string().uuid().optional(),
  /** Request a video avatar; falls back to voice if not entitled/available. Defaults to true. */
  requestVideo: z.boolean().default(true),
});
export type StartAvatarSessionInput = z.infer<typeof startAvatarSessionSchema>;
