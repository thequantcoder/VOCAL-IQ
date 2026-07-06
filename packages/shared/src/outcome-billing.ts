import { z } from 'zod';
import { computePricingChain } from './wallet.js';

/**
 * Outcome-based billing (Day 82) — pure domain shared across api/web.
 *
 * Beyond per-minute pricing, a tenant/reseller can charge per VERIFIED business outcome: a qualified
 * lead, a booking, or a successful payment. Two properties are non-negotiable and encoded here:
 *  - C (verification / no gaming, self-audit C): an outcome is only billable when the referenced
 *    entity is genuinely in an achieved state ({@link isOutcomeAchieved}), and each outcome has a
 *    single, stable dedupe key ({@link outcomeDedupeKey}) so it is billed AT MOST ONCE — you can't
 *    re-bill the same booking by replaying it.
 *  - D (money, self-audit D): all amounts are integer minor units (cents); the reseller markup reuses
 *    the audited wallet pricing chain ({@link computePricingChain}); the customer pays retail, the
 *    reseller keeps retail − wholesale. No floats.
 * Everything is pure + deterministic, so verification + billing math unit-test without a DB.
 */

export const OUTCOME_TYPES = ['qualified_lead', 'booking', 'payment'] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

/** billed on record; a disputed outcome is refunded (the wallet charge is reversed). */
export const OUTCOME_STATUSES = ['billed', 'disputed', 'refunded'] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

/** Per-tenant price for one outcome type. `markupBps` is the reseller markup (0 for a direct tenant). */
export const outcomePriceSchema = z.object({
  type: z.enum(OUTCOME_TYPES),
  priceCents: z.number().int().nonnegative().max(1_000_000_00),
  markupBps: z.number().int().min(0).max(1_000_000).default(0),
  active: z.boolean().default(true),
});
export type OutcomePriceInput = z.infer<typeof outcomePriceSchema>;

/** Request to record + bill an achieved outcome. `refId` is the lead/appointment/payment id. */
export const recordOutcomeSchema = z.object({
  type: z.enum(OUTCOME_TYPES),
  refId: z.string().min(1).max(200),
  resellerTenantId: z.string().uuid().optional(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(), // YYYY-MM for reseller margin accrual
});
export type RecordOutcomeInput = z.infer<typeof recordOutcomeSchema>;

// ── Anti-gaming dedupe keys (self-audit C) ────────────────────────────────────

/** The wallet idempotency key for billing an outcome — the SAME outcome can only ever be billed once. */
export function outcomeDedupeKey(type: OutcomeType, refId: string): string {
  return `outcome:${type}:${refId}`;
}
/** The idempotency key for refunding a disputed outcome (also at most once). */
export function outcomeRefundKey(type: OutcomeType, refId: string): string {
  return `outcome-refund:${type}:${refId}`;
}

// ── Verification (self-audit C — you can't bill an outcome that didn't happen) ──

/** Lead states that count as a billable "qualified lead" (reached qualification or beyond). */
export const QUALIFYING_LEAD_STATUSES = ['QUALIFIED', 'HOT', 'BOOKED'] as const;
/** Appointment states that count as a billable "booking" (exists + not cancelled). */
export const QUALIFYING_APPOINTMENT_STATUSES = ['BOOKED', 'RESCHEDULED', 'COMPLETED'] as const;

/**
 * Is the outcome genuinely ACHIEVED for the referenced entity's current status? A qualified-lead
 * outcome needs a qualified lead; a booking needs a live (non-cancelled) appointment; a payment needs
 * a succeeded payment. Anything else is not billable. Pure.
 */
export function isOutcomeAchieved(type: OutcomeType, entityStatus: string): boolean {
  switch (type) {
    case 'qualified_lead':
      return (QUALIFYING_LEAD_STATUSES as readonly string[]).includes(entityStatus);
    case 'booking':
      return (QUALIFYING_APPOINTMENT_STATUSES as readonly string[]).includes(entityStatus);
    case 'payment':
      return entityStatus === 'succeeded';
    default:
      return false;
  }
}

// ── Billing math (reuses the audited wallet pricing chain) ─────────────────────

export interface OutcomeCharge {
  /** The base (wholesale) price of the outcome. */
  wholesaleCents: number;
  /** What the customer tenant is charged (wholesale + reseller markup). */
  retailCents: number;
  /** What the reseller keeps (retail − wholesale); 0 for a direct tenant. */
  resellerMarginCents: number;
}

/**
 * The charge for one outcome at `priceCents` with a reseller `markupBps`. Reuses
 * {@link computePricingChain} (there is no per-outcome platform cost, so cost = 0). Integer cents.
 */
export function outcomeCharge(priceCents: number, markupBps = 0): OutcomeCharge {
  const chain = computePricingChain({
    platformCostCents: 0,
    wholesaleCents: priceCents,
    retailMarkupBps: markupBps,
  });
  return {
    wholesaleCents: chain.wholesaleCents,
    retailCents: chain.retailCents,
    resellerMarginCents: chain.resellerMarginCents,
  };
}

/**
 * The gate before billing: is this outcome billable right now? It must be a priced, active outcome
 * type AND genuinely achieved. Returns a typed reason on refusal so the API surfaces WHY (self-audit
 * C — no silent skips, no gaming).
 */
export function canBillOutcome(input: {
  price?: { priceCents: number; active: boolean } | null;
  entityStatus?: string | null;
  type: OutcomeType;
}): { ok: true; priceCents: number } | { ok: false; reason: string } {
  if (!input.price || !input.price.active)
    return { ok: false, reason: `No active price configured for ${input.type}.` };
  if (input.price.priceCents <= 0) return { ok: false, reason: 'Outcome price is zero.' };
  if (!input.entityStatus) return { ok: false, reason: 'Referenced record not found.' };
  if (!isOutcomeAchieved(input.type, input.entityStatus))
    return { ok: false, reason: `Outcome not achieved (status ${input.entityStatus}).` };
  return { ok: true, priceCents: input.price.priceCents };
}
