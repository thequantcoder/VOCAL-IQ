import { createHmac, timingSafeEqual } from 'node:crypto';
import { SubscriptionStatus } from '@vocaliq/shared';

/**
 * Stripe webhook signature verification (self-audit focus C — no un-verified mutation).
 * Reimplements Stripe's documented scheme so it's testable offline and has no SDK
 * dependency: the `Stripe-Signature` header is `t=<unix>,v1=<hex>`, where the signature
 * is HMAC-SHA256(secret, "<t>.<rawBody>"). We compare in constant time and reject stale
 * timestamps (replay protection). The live secret (STRIPE_WEBHOOK_SECRET) is injected.
 */

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string,
  opts: { toleranceSec?: number; nowSec?: number } = {},
): VerifyResult {
  if (!header) return { ok: false, reason: 'missing signature header' };
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim(), v?.trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: 'malformed signature header' };

  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  if (!safeEqualHex(expected, v1)) return { ok: false, reason: 'signature mismatch' };

  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSec ?? 300;
  if (Math.abs(now - t) > tolerance) return { ok: false, reason: 'timestamp outside tolerance' };

  return { ok: true };
}

/** Constant-time hex compare (equal length required — Stripe sigs are fixed width). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Map a Stripe event type to the subscription status it should drive. Returns null for
 * events we don't act on. Kept pure so the state transition is unit-tested.
 */
export function mapEventToStatus(eventType: string): SubscriptionStatus | null {
  switch (eventType) {
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'customer.subscription.created':
      return SubscriptionStatus.ACTIVE;
    case 'invoice.payment_failed':
      return SubscriptionStatus.PAST_DUE;
    case 'customer.subscription.deleted':
      return SubscriptionStatus.CANCELLED;
    case 'customer.subscription.trial_will_end':
      return SubscriptionStatus.TRIALING;
    default:
      return null;
  }
}
