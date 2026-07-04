import { z } from 'zod';

/**
 * No-code plan & pricing builder (Day 56) — pure schemas + versioning logic shared across
 * api/web. Money is integer minor units (cents) — never floats. The API layer enforces WHO may
 * write which plan (super-admin → global; reseller → its own); here we keep only the shape +
 * the pure "does this edit need a new version?" decision so it's unit-testable in isolation.
 */

/** Feature toggles/values attached to a plan (free-form but validated as a flat record). */
export const planFeaturesSchema = z.record(z.union([z.boolean(), z.number(), z.string()]));
export type PlanFeatures = z.infer<typeof planFeaturesSchema>;

/** The editable definition of a plan. All limits are non-negative ints; money is minor units. */
export const planInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceMonthly: z.number().int().min(0),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  includedMinutes: z.number().int().min(0).default(0),
  agentLimit: z.number().int().min(0).default(1),
  numberLimit: z.number().int().min(0).default(0),
  sipLimit: z.number().int().min(0).default(0),
  overageRatePerMin: z.number().int().min(0).default(0),
  features: planFeaturesSchema.default({}),
  isResellerPlan: z.boolean().default(false),
});
export type PlanInput = z.infer<typeof planInputSchema>;

/**
 * The pricing/limit fields that materially change what a subscriber pays or gets. A change to any
 * of these on a plan that HAS active subscribers must NOT mutate the plan in place — it forks a
 * new version so existing subscribers are grandfathered onto the old terms. Cosmetic fields
 * (name, features flags) can be edited in place.
 */
export const PRICING_FIELDS = [
  'priceMonthly',
  'currency',
  'includedMinutes',
  'agentLimit',
  'numberLimit',
  'sipLimit',
  'overageRatePerMin',
] as const;
export type PricingField = (typeof PRICING_FIELDS)[number];

export interface PricingSnapshot {
  priceMonthly: number;
  currency: string;
  includedMinutes: number;
  agentLimit: number;
  numberLimit: number;
  sipLimit: number;
  overageRatePerMin: number;
}

/** Which pricing fields differ between the current plan and a proposed edit. */
export function diffPricingFields(current: PricingSnapshot, next: PricingSnapshot): PricingField[] {
  return PRICING_FIELDS.filter((f) => current[f] !== next[f]);
}

/**
 * Decide how to apply an edit. If the plan has active subscribers AND any pricing field changed,
 * we must VERSION (fork) to grandfather them; otherwise we can update in place. Returns the
 * changed pricing fields for logging/UX.
 */
export function planUpdateStrategy(
  current: PricingSnapshot,
  next: PricingSnapshot,
  hasActiveSubscribers: boolean,
): { action: 'update' | 'version'; changedPricing: PricingField[] } {
  const changedPricing = diffPricingFields(current, next);
  const action = hasActiveSubscribers && changedPricing.length > 0 ? 'version' : 'update';
  return { action, changedPricing };
}
