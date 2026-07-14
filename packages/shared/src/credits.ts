/**
 * Promotional / bonus credits (PARITY-08) — the pure core + input schemas. A grant is a pool of
 * credits spent BEFORE the paid wallet balance, that can expire and never pays out as cash. The
 * spend-order allocation here is pure (no I/O) so it is exhaustively unit-testable; the service
 * applies the returned decrements inside the atomic, race-safe debit transaction.
 */
import { z } from 'zod';

export const GRANT_KINDS = ['PROMO', 'BONUS', 'REFERRAL', 'MANUAL'] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

/** A spendable slice of a grant. The CALLER pre-sorts (soonest expiry first, then oldest). */
export interface CreditGrantSlice {
  id: string;
  remainingCents: number;
}

export interface PromoAllocation {
  grantId: string;
  appliedCents: number;
}

export interface PromoAllocationResult {
  /** Which grants pay how much, in spend order. */
  allocations: PromoAllocation[];
  /** Total funded from promo/bonus grants. */
  promoAppliedCents: number;
  /** What is left for the paid wallet balance to cover. */
  remainderCents: number;
}

/**
 * Spend-order allocation: consume `amountCents` from `grants` (promo/bonus) in the given order —
 * the caller pre-sorts by soonest expiry, then oldest — BEFORE any paid balance. Pure: returns the
 * per-grant decrements + the paid remainder. Never allocates more than a grant's remaining or the
 * amount owed; ignores non-positive slices.
 */
export function allocatePromoCredits(
  grants: CreditGrantSlice[],
  amountCents: number,
): PromoAllocationResult {
  const want = Math.max(0, Math.round(amountCents));
  const allocations: PromoAllocation[] = [];
  let remaining = want;
  for (const g of grants) {
    if (remaining <= 0) break;
    const avail = Math.max(0, Math.round(g.remainingCents));
    const take = Math.min(avail, remaining);
    if (take > 0) {
      allocations.push({ grantId: g.id, appliedCents: take });
      remaining -= take;
    }
  }
  return { allocations, promoAppliedCents: want - remaining, remainderCents: remaining };
}

/** True when a grant is spendable now: not revoked, unexpired, and with credits left. */
export function isGrantActive(
  grant: {
    remainingCents: number;
    expiresAt?: Date | string | null;
    revokedAt?: Date | string | null;
  },
  now: Date,
): boolean {
  if (grant.revokedAt) return false;
  if (grant.remainingCents <= 0) return false;
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

// ── Input schemas ──────────────────────────────────────────────────────────

const AMOUNT_CAP_CENTS = 100_000_00; // $100k sanity ceiling on any single grant / code

/** An operator (super-admin / reseller) granting bonus credits to a tenant. */
export const grantCreditInputSchema = z.object({
  kind: z.enum(GRANT_KINDS).default('BONUS'),
  amountCents: z.number().int().positive().max(AMOUNT_CAP_CENTS),
  source: z.string().trim().min(1).max(120),
  expiresAt: z.string().datetime().optional(), // ISO 8601; absent = never expires
});
export type GrantCreditInput = z.infer<typeof grantCreditInputSchema>;

/** A tenant redeeming a promo code. */
export const redeemPromoInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type RedeemPromoInput = z.infer<typeof redeemPromoInputSchema>;

/** A super-admin creating a redeemable promo code. */
export const createPromoCodeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code may use letters, digits, - and _ only'),
  kind: z.enum(GRANT_KINDS).default('PROMO'),
  amountCents: z.number().int().positive().max(AMOUNT_CAP_CENTS),
  maxRedemptions: z.number().int().positive().max(1_000_000).optional(),
  perTenantLimit: z.number().int().positive().max(1000).default(1),
  expiresAt: z.string().datetime().optional(),
});
export type CreatePromoCodeInput = z.infer<typeof createPromoCodeInputSchema>;

/** Normalise a promo code for storage + lookup (case-insensitive, trimmed). */
export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}
