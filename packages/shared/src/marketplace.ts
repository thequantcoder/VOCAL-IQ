import { z } from 'zod';

/**
 * Agent-template marketplace (Day 83) — pure domain shared across api/web.
 *
 * Creators publish a snapshot of an agent (persona + flow) as a paid listing; after platform review
 * it goes live; buyers purchase + clone it into their own tenant; the price splits between the creator
 * and the platform. Three properties matter:
 *  - D (rev-share correctness, self-audit D): the split is exact integer cents — creator + platform
 *    always sum to the price, no rounding leak ({@link revShareSplit}).
 *  - C (review/approval, self-audit C): a listing only becomes buyable through an explicit state
 *    machine (draft → pending → approved), and only `approved` listings are ever purchasable
 *    ({@link canTransitionListing}, {@link isPurchasable}).
 *  - Isolation (self-audit B, enforced at the data layer): a purchase clones the snapshot into the
 *    BUYER's tenant; drafts/purchases/payouts stay private; only approved listings are public.
 * Everything is pure + deterministic, so the money split + state machine unit-test without a DB.
 */

/** draft → pending (submit) → approved | rejected; approved → delisted; rejected → draft (revise). */
export const LISTING_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'delisted'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

const TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ['pending'],
  pending: ['approved', 'rejected'],
  approved: ['delisted'],
  rejected: ['draft'],
  delisted: [],
};

/** Is a listing status change legal? (the review/approval gate — self-audit C). */
export function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Only an approved listing can be bought. */
export function isPurchasable(status: ListingStatus): boolean {
  return status === 'approved';
}

export const listingInputSchema = z.object({
  sourceAgentId: z.string().uuid(),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(''),
  priceCents: z.number().int().min(0).max(1_000_000_00),
});
export type ListingInput = z.infer<typeof listingInputSchema>;

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

// ── Revenue share (pure, exact — self-audit D) ────────────────────────────────

export interface RevShareSplit {
  priceCents: number;
  /** What the creator earns (price × revShareBps, rounded). */
  creatorCents: number;
  /** What the platform keeps (the exact remainder — creator + platform === price). */
  platformCents: number;
}

/**
 * Split a purchase price between the creator and the platform. `revShareBps` is the CREATOR's share
 * in basis points (e.g. 7000 = 70% to the creator). The platform gets the exact remainder, so the two
 * ALWAYS sum to the price — no rounding cent is ever created or lost (self-audit D). Pure.
 */
export function revShareSplit(priceCents: number, revShareBps: number): RevShareSplit {
  const price = Math.max(0, Math.round(priceCents));
  const bps = Math.min(10_000, Math.max(0, Math.round(revShareBps)));
  const creatorCents = Math.round((price * bps) / 10_000);
  return { priceCents: price, creatorCents, platformCents: price - creatorCents };
}

/** The idempotency key for a purchase — a buyer pays for a given listing at most once. */
export function purchaseKey(buyerTenantId: string, listingId: string): string {
  return `purchase:${buyerTenantId}:${listingId}`;
}
/** The idempotency key for the creator's payout of a purchase. */
export function payoutKey(listingId: string, buyerTenantId: string): string {
  return `payout:${listingId}:${buyerTenantId}`;
}

// ── Ratings (pure) ────────────────────────────────────────────────────────────

/** Fold a new rating into a running average + count (returns a 2-dp average). */
export function addRating(
  avg: number,
  count: number,
  rating: number,
): { avg: number; count: number } {
  const total = avg * count + rating;
  const nextCount = count + 1;
  return { avg: Math.round((total / nextCount) * 100) / 100, count: nextCount };
}
