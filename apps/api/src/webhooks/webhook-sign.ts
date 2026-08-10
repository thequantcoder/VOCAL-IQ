import { createHmac } from 'node:crypto';

/**
 * Webhook signing (Day 48) — server-only (`node:crypto`). Each delivery is signed so receivers
 * can verify authenticity: `X-VocalIQ-Signature: sha256=<hex>` over `"<timestamp>.<body>"` with
 * the endpoint's secret (the timestamp guards against replay). Mirrors the Stripe/Twilio scheme
 * receivers already know (self-audit C).
 */
export function signWebhook(secret: string, body: string, timestampSec: number): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex')}`;
}
