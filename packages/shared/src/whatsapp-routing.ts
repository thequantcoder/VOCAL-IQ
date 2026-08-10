import type { WaCallBlockReason } from './whatsapp-permission.js';

/**
 * WhatsApp least-cost routing + restriction/pickup guardrails — the pure decision core (WAC-09, plan
 * §D.7/§A.11). One outbound intent picks the cheapest ALLOWED channel (WhatsApp vs PSTN/SIP): never
 * against the permission gate, DNC, a blocked country, or an active Meta restriction, and it backs off
 * WhatsApp before a low-pickup restriction bites. No I/O here — the service supplies live inputs.
 */

export type WaRoutingPolicy =
  | 'whatsapp_if_permitted' // default: WhatsApp when allowed, else PSTN
  | 'whatsapp_preferred' // same as above but also picks WhatsApp on ties
  | 'pstn_preferred' // always PSTN unless forced otherwise
  | 'cheapest'; // compare per-minute cost among allowed channels

export const WA_ROUTING_POLICIES: readonly WaRoutingPolicy[] = [
  'whatsapp_if_permitted',
  'whatsapp_preferred',
  'pstn_preferred',
  'cheapest',
];

export type RouteChannel = 'whatsapp' | 'pstn';

/** Why a route was chosen — block reasons are reused from the permission gate for transparency. */
export type RouteReason =
  | WaCallBlockReason
  | 'not_whatsapp_user'
  | 'whatsapp_restricted'
  | 'throttled_low_pickup'
  | 'policy_pstn_preferred'
  | 'pstn_cheaper'
  | 'whatsapp_cheaper'
  | 'permitted';

export interface RoutePlanInput {
  policy: WaRoutingPolicy;
  isWhatsappUser: boolean;
  whatsappEnabled: boolean;
  whatsappRestricted: boolean;
  throttled?: boolean;
  canCallAllowed: boolean;
  canCallReason?: WaCallBlockReason;
  whatsappCostPerMin?: number;
  pstnCostPerMin?: number;
}

export interface RoutePlan {
  channel: RouteChannel;
  reason: RouteReason;
}

/**
 * Pick the outbound channel. Order: not-a-WhatsApp-user / WhatsApp disabled → PSTN; active restriction
 * → PSTN; low-pickup throttle → PSTN; permission gate blocks → PSTN (with the gate's reason); else
 * apply the tenant's policy (preferred / pstn-preferred / cheapest).
 */
export function chooseWhatsappRoute(i: RoutePlanInput): RoutePlan {
  if (!i.whatsappEnabled || !i.isWhatsappUser) {
    return { channel: 'pstn', reason: 'not_whatsapp_user' };
  }
  if (i.whatsappRestricted) return { channel: 'pstn', reason: 'whatsapp_restricted' };
  if (i.throttled) return { channel: 'pstn', reason: 'throttled_low_pickup' };
  if (!i.canCallAllowed) {
    return { channel: 'pstn', reason: i.canCallReason ?? 'no_permission' };
  }

  // WhatsApp is allowed — apply the tenant policy.
  if (i.policy === 'pstn_preferred') return { channel: 'pstn', reason: 'policy_pstn_preferred' };
  if (i.policy === 'cheapest' && i.whatsappCostPerMin != null && i.pstnCostPerMin != null) {
    return i.pstnCostPerMin < i.whatsappCostPerMin
      ? { channel: 'pstn', reason: 'pstn_cheaper' }
      : { channel: 'whatsapp', reason: 'whatsapp_cheaper' };
  }
  return { channel: 'whatsapp', reason: 'permitted' };
}

// ── Pickup-rate throttle (dodge Meta's low-pickup RESTRICTED_* before it bites) ────────────────────

/** Below this rolling answered/attempted rate, throttle WhatsApp outbound. */
export const WHATSAPP_PICKUP_FLOOR = 0.3;
/** Don't throttle on a tiny sample — need at least this many attempts first. */
export const WHATSAPP_MIN_ATTEMPTS_FOR_PICKUP = 10;

export function whatsappPickupRate(answered: number, attempted: number): number {
  return attempted > 0 ? answered / attempted : 1;
}

export function shouldThrottleWhatsapp(
  answered: number,
  attempted: number,
  floor = WHATSAPP_PICKUP_FLOOR,
): boolean {
  if (attempted < WHATSAPP_MIN_ATTEMPTS_FOR_PICKUP) return false;
  return whatsappPickupRate(answered, attempted) < floor;
}

// ── Restriction state (from Meta's account_update webhook, tracked with a local expiry) ─────────────

export interface WaRestriction {
  /** e.g. RESTRICTED_BIZ_INITIATED_CALLING, RESTRICTED_USER_INITIATED_CALLING_CALL_BUTTON_HIDDEN. */
  type: string;
  /** 'business_initiated' | 'user_initiated' — which direction is restricted (optional). */
  direction?: string;
  /** ISO string; Meta restrictions are 7-day. Absent → treated as active until cleared. */
  expiresAt?: string;
}

export function isWhatsappRestrictionActive(
  r: WaRestriction | null | undefined,
  now: Date,
): boolean {
  if (!r?.type) return false;
  if (!r.expiresAt) return true;
  return now.getTime() < new Date(r.expiresAt).getTime();
}

/** Meta's 7-day restriction window. */
export const WHATSAPP_RESTRICTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Best-effort parse of an `account_update` restriction/violation webhook into a {@link WaRestriction}
 * with a local 7-day expiry (Meta gives no expiry). Tolerant of shape — extracts a `RESTRICTED_*` /
 * violation type from the common locations; returns null when there's no restriction. The exact live
 * payload is confirmed in the WAC-00 smoke; until then this reads what Meta documents.
 */
export function parseWhatsappRestriction(
  payload: unknown,
  now: Date,
  ttlMs = WHATSAPP_RESTRICTION_TTL_MS,
): WaRestriction | null {
  const v = (payload ?? {}) as Record<string, unknown>;
  const nested = (v.restriction ?? v.ban_info ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof nested.type === 'string' ? nested.type : undefined) ??
    (typeof v.type === 'string' ? v.type : undefined) ??
    (typeof v.event === 'string' && v.event.includes('RESTRICTED') ? v.event : undefined);
  if (!candidate) return null;
  const direction = typeof nested.direction === 'string' ? nested.direction : undefined;
  return {
    type: candidate,
    ...(direction ? { direction } : {}),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}
