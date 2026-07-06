import { z } from 'zod';
import { luhnValid, stripCardData } from './compliance.js';
import { ValidationError } from './errors.js';

/**
 * Pay-by-voice (Day 78) — pure payment domain shared across api/voice/web.
 *
 * The whole feature is built on the PCI **out-of-scope (SAQ-A)** model: a customer's card details
 * are captured by a PCI-DSS-compliant provider (DTMF/tokenised at the media layer) and VocalIQ only
 * ever sees a token + a charge result — **never the PAN/CVV/expiry**. Everything here reflects that:
 * amounts are integer minor units (cents, never floats — like the wallet), a stored payment carries
 * only a provider ref + `last4`, and {@link containsCardData}/{@link assertPciSafe} are the guards
 * that keep a raw card number from ever reaching a store, log, transcript, or event (self-audit C).
 */

/** pending → authorized/succeeded | failed; a succeeded charge can later be (partially) refunded. */
export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Where a receipt is sent after a successful charge (gated on a configured channel). */
export const RECEIPT_CHANNELS = ['none', 'email', 'sms'] as const;
export type ReceiptChannel = (typeof RECEIPT_CHANNELS)[number];

/** ISO-4217-ish: exactly three letters. Kept permissive; the processor is the source of truth. */
const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter code')
  .transform((c) => c.toUpperCase());

/**
 * A request to take a payment. `amountCents` is integer minor units (never a float). `idempotencyKey`
 * makes a retry safe — the same key never charges twice. `receiptTo` is an email/phone (or a
 * `{{variable}}` reference resolved by the flow at runtime).
 */
export const paymentRequestSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_00), // ≤ $100k sanity cap
  currency: currencySchema.default('USD'),
  description: z.string().max(200).default(''),
  callId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  receiptChannel: z.enum(RECEIPT_CHANNELS).default('none'),
  receiptTo: z.string().max(160).default(''),
});
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export const refundInputSchema = z.object({
  /** Omit to refund the full remaining amount. */
  amountCents: z.number().int().positive().optional(),
  reason: z.string().max(200).optional(),
  /** Makes a refund retry safe — replaying the same key returns the payment without refunding again. */
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type RefundInput = z.infer<typeof refundInputSchema>;

/** What a PCI capture provider returns after capturing + charging — NEVER contains a PAN. */
export interface CaptureResult {
  /** Opaque provider charge id (safe to store). */
  chargeId: string;
  /** Provider payment-method token (safe to store) — for refunds/repeat, never the card. */
  token: string;
  /** Last four digits only — the ONLY card-derived value we may keep. */
  last4: string;
  status: PaymentStatus;
}

// ── PCI-safety guards (self-audit C — the whole point) ────────────────────────

/**
 * Does this text contain a real (Luhn-valid) card number? Used to ASSERT that card data never
 * reaches a store/transcript/log, and to redact defensively if it somehow does. A 13–19 digit
 * Luhn-valid run counts; ordinary numbers (amounts, order ids) don't.
 */
export function containsCardData(text: string): boolean {
  if (!text) return false;
  const matches = text.match(/\b(?:\d[ -]?){13,19}\b/g);
  return matches?.some((m) => luhnValid(m)) ?? false;
}

/** Redact any card-shaped data from text before it can be persisted/emitted (defense-in-depth). */
export function scrubCardData(text: string): string {
  return stripCardData(text);
}

/**
 * Guard for anything about to be stored/logged as part of a payment: throws if it smells like a
 * card number. Fields are checked recursively (strings only). This is the last line of defence
 * that keeps PANs out of the Payment row + its metadata.
 */
export function assertPciSafe(value: unknown, path = 'value'): void {
  if (typeof value === 'string') {
    if (containsCardData(value))
      throw new ValidationError(`Card data is not allowed in ${path} — it must never be stored.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertPciSafe(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertPciSafe(v, `${path}.${k}`);
  }
}

// ── Refund math (pure) ────────────────────────────────────────────────────────

/** How much of a payment can still be refunded. */
export function refundableCents(amountCents: number, refundedCents: number): number {
  return Math.max(0, amountCents - refundedCents);
}

/**
 * Apply a refund of `requestCents` (or the full remaining amount when omitted) to a payment.
 * Returns the new refunded total + status, or a typed error when the payment isn't refundable or
 * the amount exceeds what remains. Pure + deterministic.
 */
export function applyRefund(
  payment: { amountCents: number; refundedCents: number; status: PaymentStatus },
  requestCents?: number,
): { ok: true; refundedCents: number; status: PaymentStatus } | { ok: false; reason: string } {
  const refundable =
    payment.status === 'succeeded' ||
    payment.status === 'partially_refunded' ||
    payment.status === 'refunded';
  if (!refundable) return { ok: false, reason: 'Only a succeeded payment can be refunded.' };
  const remaining = refundableCents(payment.amountCents, payment.refundedCents);
  if (remaining <= 0) return { ok: false, reason: 'Payment is already fully refunded.' };
  const amount = requestCents ?? remaining;
  if (amount <= 0) return { ok: false, reason: 'Refund amount must be positive.' };
  if (amount > remaining) return { ok: false, reason: 'Refund exceeds the refundable amount.' };
  const refundedCents = payment.refundedCents + amount;
  const status: PaymentStatus =
    refundedCents >= payment.amountCents ? 'refunded' : 'partially_refunded';
  return { ok: true, refundedCents, status };
}

// ── Formatting (receipts) ─────────────────────────────────────────────────────

/** Format minor units as a human amount (e.g. 1999, "USD" → "$19.99"). */
export function formatAmount(amountCents: number, currency: string): string {
  const major = (amountCents / 100).toFixed(2);
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? '';
  return symbol ? `${symbol}${major}` : `${major} ${currency.toUpperCase()}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
};

/** Build a plain receipt line for a succeeded payment (card data is only ever the last4). */
export function buildReceipt(input: {
  amountCents: number;
  currency: string;
  description?: string;
  last4?: string;
  chargeId: string;
}): string {
  const amount = formatAmount(input.amountCents, input.currency);
  const forWhat = input.description ? ` for ${input.description}` : '';
  const card = input.last4 ? ` (card ending ${input.last4})` : '';
  return `Payment of ${amount}${forWhat} received${card}. Ref ${input.chargeId}. Thank you!`;
}
