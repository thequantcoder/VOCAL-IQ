/**
 * Messenger (Meta) Calling — the OUTBOUND governor (MEC-08): the pure decision core (no I/O) that answers
 * "may the Page place a WebRTC call to this Messenger user right now?". Enforced BEFORE we ever dial, so
 * every rule is unit-tested. The near-sibling of the WhatsApp governor ([[whatsapp-permission]]), but the
 * divergences are deliberate — do NOT re-derive them from a blind WhatsApp clone:
 *
 *   • Identity is a **PSID**, not a phone number → there is **no blocked-country rule** and no dial-code
 *     routing (a PSID has no PSTN identity).
 *   • Permission status **and** the rate limits come **LIVE** from Meta's Call-Permissions API (read by the
 *     provider-router adapter), so we do NOT hardcode Meta's caps — we enforce whatever Meta returns
 *     (`canPerformAction` + `maxAllowed`/`currentUsage`). This is why there is no permission-request send
 *     cap here (WhatsApp reconstructs permission from webhook replies; Messenger reads it live).
 *   • The consecutive-unanswered back-off is a **local anti-abuse guardrail** (never spam a user who never
 *     answers — golden rule: build the anti-abuse controls). Whether Meta *itself* auto-revokes on
 *     unanswered calls is `[CONFIRM @ MEC-00]`; the guardrail is conservative regardless.
 *
 * See `docs/MESSENGER-CALLING-AI-ENGINE-PLAN.md` §A.4/§G (MEC-08). The Meta wire specifics live behind the
 * provider-router adapter (`adapters/messenger-calling.ts`); this module is pure policy.
 */

export type MessengerPermissionStatus = 'no_permission' | 'temporary' | 'permanent';

/** The Call-Permissions API action that authorises placing a call. [CONFIRM @ MEC-00: exact name.] */
export const MESSENGER_CALL_ACTION = 'CALL';

/**
 * N consecutive unanswered outbound calls to the same user → local hard-stop back-off (we pause before the
 * Nth so we never pile on a user who isn't picking up). Conservative default; `[CONFIRM @ MEC-00]` whether
 * Meta enforces its own auto-revoke on top of this.
 */
export const MESSENGER_UNANSWERED_BACKOFF = 3;

export type MeCallBlockReason =
  | 'no_permission'
  | 'permission_expired'
  | 'rate_limited'
  | 'unanswered_backoff'
  | 'dnc';

/** The live rate window Meta returns for the call action (from the Call-Permissions API). */
export interface MeCallActionLimit {
  maxAllowed: number;
  currentUsage: number;
}

export interface MeCanCallInput {
  status: MessengerPermissionStatus;
  /** Epoch-SECONDS expiry for a temporary permission (Meta's `expiration_time`). Ignored otherwise. */
  expiresAtSec?: number | null;
  /**
   * Whether Meta says the Page may perform the call action right now (`can_perform_action`). Meta folds
   * its own rate limits into this, so it is the authoritative signal. Omitted → not asserted (we fall back
   * to the permission status + the numeric limit below).
   */
  callActionAllowed?: boolean;
  /** The live rate window for the call action, when Meta returned one. */
  callActionLimit?: MeCallActionLimit | null;
  /** Consecutive unanswered outbound calls to this user (derived from call history). */
  consecutiveUnanswered: number;
  /** The contact is on the do-not-call list. */
  dnc?: boolean;
}

export interface MeCanCallDecision {
  allowed: boolean;
  reason?: MeCallBlockReason;
}

/** Is a permission currently usable (permanent, or temporary and not yet expired)? */
export function isMessengerPermissionActive(
  status: MessengerPermissionStatus,
  expiresAtSec: number | null | undefined,
  now: Date,
): boolean {
  if (status === 'permanent') return true;
  if (status === 'temporary') {
    return (
      expiresAtSec != null && Number.isFinite(expiresAtSec) && now.getTime() < expiresAtSec * 1000
    );
  }
  return false;
}

/**
 * The pre-dial gate: may the Page place a Messenger call to this user right now? Checks (in order)
 * DNC → active permission → local unanswered back-off → Meta's live rate limit. Returns a typed reason
 * when blocked. `callActionAllowed` (Meta's own verdict) is authoritative; the numeric limit is only
 * enforced when Meta returned a positive `maxAllowed` (the adapter defaults a missing cap to 0, which we
 * therefore treat as "no cap reported", not "zero calls allowed").
 */
export function canPlaceMessengerCall(input: MeCanCallInput, now: Date): MeCanCallDecision {
  if (input.dnc) return { allowed: false, reason: 'dnc' };

  if (!isMessengerPermissionActive(input.status, input.expiresAtSec, now)) {
    return {
      allowed: false,
      reason: input.status === 'temporary' ? 'permission_expired' : 'no_permission',
    };
  }

  if (input.consecutiveUnanswered >= MESSENGER_UNANSWERED_BACKOFF) {
    return { allowed: false, reason: 'unanswered_backoff' };
  }

  // Meta's own verdict is authoritative (it already folds in its rate limits).
  if (input.callActionAllowed === false) return { allowed: false, reason: 'rate_limited' };
  const limit = input.callActionLimit;
  if (limit && limit.maxAllowed > 0 && limit.currentUsage >= limit.maxAllowed) {
    return { allowed: false, reason: 'rate_limited' };
  }

  return { allowed: true };
}

/** Operator-facing message for each pre-dial block reason (surfaced by the outbound route). */
export function messengerOutboundBlockedMessage(reason: MeCallBlockReason | undefined): string {
  switch (reason) {
    case 'dnc':
      return 'This contact is on the do-not-call list.';
    case 'no_permission':
      return 'This user has not granted call permission — the Page cannot place a call yet.';
    case 'permission_expired':
      return 'Call permission has expired — it must be granted again before calling.';
    case 'unanswered_backoff':
      return 'Too many consecutive unanswered calls — pausing to avoid abusing this contact.';
    case 'rate_limited':
      return 'Meta’s call rate limit for this user has been reached — try again later.';
    default:
      return 'This call is not permitted right now.';
  }
}
