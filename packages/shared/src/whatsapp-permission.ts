/**
 * WhatsApp Business Calling — the OUTBOUND governor (WAC-08). Meta gates business→user calls tightly:
 * permission is required (and expires silently), sends are rate-capped, consecutive-unanswered auto-
 * revokes, and 5 business-number countries are blocked. This module is the pure decision core — no I/O
 * — so every rule is unit-tested and enforced BEFORE we ever dial. See
 * `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` §A.4/§A.5/§A.11.
 */

/** Business-number countries where OUTBOUND WhatsApp calling is blocked (ISO-2, §A.11). */
export const WHATSAPP_BLOCKED_CALLING_COUNTRIES = ['US', 'CA', 'EG', 'VN', 'NG'] as const;

/** ≤100 connected calls / 24 h per business↔user pair. */
export const WHATSAPP_MAX_CONNECTED_PER_DAY = 100;
/** ≤1 permission request / 24 h per pair. */
export const WHATSAPP_PERMISSION_REQUESTS_PER_DAY = 1;
/** ≤2 permission requests / 7 days per pair. */
export const WHATSAPP_PERMISSION_REQUESTS_PER_WEEK = 2;
/** 4 consecutive unanswered → Meta auto-revokes permission. */
export const WHATSAPP_UNANSWERED_REVOKE = 4;
/** 2 consecutive unanswered → user nudge (back-off warning). */
export const WHATSAPP_UNANSWERED_BACKOFF = 2;
/** Temporary permission lasts 7 days (168 h) when Meta doesn't give an explicit expiry. */
export const WHATSAPP_TEMPORARY_PERMISSION_MS = 168 * 60 * 60 * 1000;

export type WaPermissionState = 'no_permission' | 'temporary' | 'permanent';

export type WaCallBlockReason =
  | 'no_permission'
  | 'permission_expired'
  | 'blocked_country'
  | 'unanswered_backoff'
  | 'daily_connected_cap'
  | 'dnc';

export interface CanCallInput {
  state: WaPermissionState;
  /** Epoch-ms expiry for a temporary permission (ignored for permanent/no_permission). */
  expiresAtMs?: number | null;
  /** Connected calls to this user in the last 24 h. */
  connectedLast24h: number;
  /** Consecutive unanswered calls to this user (resets on any answer). */
  consecutiveUnanswered: number;
  /** The BUSINESS number's country (ISO-2). Omitted → not checked locally (Meta still enforces). */
  businessCountry?: string;
  /** The contact is on the do-not-call list. */
  dnc?: boolean;
}

export interface CanCallDecision {
  allowed: boolean;
  reason?: WaCallBlockReason;
}

/** Is a permission currently usable (permanent, or temporary and not yet expired)? */
export function isWhatsappPermissionActive(
  state: WaPermissionState,
  expiresAtMs: number | null | undefined,
  now: Date,
): boolean {
  if (state === 'permanent') return true;
  if (state === 'temporary') return expiresAtMs != null && now.getTime() < expiresAtMs;
  return false;
}

/**
 * The pre-dial gate: may the business place a WhatsApp call to this user right now? Checks (in order)
 * DNC → blocked business country → active permission → unanswered back-off (hard-stop before the 4th,
 * which auto-revokes) → the ≤100/24 h connected cap. Returns a typed reason when blocked.
 */
export function canPlaceWhatsappCall(input: CanCallInput, now: Date): CanCallDecision {
  if (input.dnc) return { allowed: false, reason: 'dnc' };

  if (
    input.businessCountry &&
    (WHATSAPP_BLOCKED_CALLING_COUNTRIES as readonly string[]).includes(
      input.businessCountry.toUpperCase(),
    )
  ) {
    return { allowed: false, reason: 'blocked_country' };
  }

  if (!isWhatsappPermissionActive(input.state, input.expiresAtMs, now)) {
    return {
      allowed: false,
      reason: input.state === 'temporary' ? 'permission_expired' : 'no_permission',
    };
  }

  // Hard-stop before the 4th consecutive unanswered (the 4th auto-revokes the permission).
  if (input.consecutiveUnanswered >= WHATSAPP_UNANSWERED_REVOKE - 1) {
    return { allowed: false, reason: 'unanswered_backoff' };
  }

  if (input.connectedLast24h >= WHATSAPP_MAX_CONNECTED_PER_DAY) {
    return { allowed: false, reason: 'daily_connected_cap' };
  }

  return { allowed: true };
}

export type WaRequestBlockReason = 'daily_request_cap' | 'weekly_request_cap';

export interface CanRequestDecision {
  allowed: boolean;
  reason?: WaRequestBlockReason;
}

/** May we send another permission-request message? Enforces the 1/24 h and 2/7 d send caps. */
export function canSendWhatsappPermissionRequest(counts: {
  sentLast24h: number;
  sentLast7d: number;
}): CanRequestDecision {
  if (counts.sentLast24h >= WHATSAPP_PERMISSION_REQUESTS_PER_DAY) {
    return { allowed: false, reason: 'daily_request_cap' };
  }
  if (counts.sentLast7d >= WHATSAPP_PERMISSION_REQUESTS_PER_WEEK) {
    return { allowed: false, reason: 'weekly_request_cap' };
  }
  return { allowed: true };
}

/**
 * Resolve a temporary permission's expiry (epoch-ms) from Meta's `expiration_timestamp` (seconds) if
 * present, else default to now + 7 days (Meta never sends an expiry webhook — we track the clock).
 */
export function whatsappTemporaryExpiry(
  expirationTimestampSec: number | undefined,
  now: Date,
): number {
  if (expirationTimestampSec && Number.isFinite(expirationTimestampSec)) {
    return expirationTimestampSec * 1000;
  }
  return now.getTime() + WHATSAPP_TEMPORARY_PERMISSION_MS;
}
