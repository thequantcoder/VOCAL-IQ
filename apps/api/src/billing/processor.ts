import { BillingError } from '@vocaliq/shared';

/**
 * Payment-processor seam (golden rule #2, provider-agnostic). The billing LOGIC (plans,
 * entitlements, proration, dunning, usage) is built + tested against this interface; the
 * live Stripe implementation swaps in once STRIPE_* keys are set (memory:
 * stripe-live-test-pending), with no change to the services/controller.
 */

export interface CheckoutRequest {
  tenantId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface UsagePush {
  tenantId: string;
  subscriptionExternalId: string;
  quantity: number; // billable minutes/units
  periodEnd: Date;
}

/** A plan to mirror into the processor as a product + recurring price (Day 56). */
export interface PlanSync {
  planId: string;
  name: string;
  priceMonthly: number; // minor units
  currency: string;
  /** The processor's existing product id, if this plan was synced before (update vs create). */
  stripeProductId?: string | null;
}

/** The external ids the processor assigns — persisted back onto the Plan for reuse. */
export interface PlanSyncResult {
  stripeProductId: string | null;
  stripePriceId: string | null;
  synced: boolean; // false when the processor is not configured (gated)
}

export interface BillingProcessor {
  readonly name: string;
  createCheckoutSession(req: CheckoutRequest): Promise<{ url: string }>;
  reportUsage(push: UsagePush): Promise<void>;
  /** Mirror a plan to the processor's catalog. Gated processors return `{ synced: false }`. */
  syncPlan(plan: PlanSync): Promise<PlanSyncResult>;
}

export const BILLING_PROCESSOR = Symbol('BILLING_PROCESSOR');

/**
 * Default until Stripe is configured: it records nothing and refuses live actions with a
 * clear, safe error, so the app runs + the billing logic ships + tests now.
 */
export class PendingBillingProcessor implements BillingProcessor {
  readonly name = 'pending';

  async createCheckoutSession(): Promise<{ url: string }> {
    throw new BillingError('Billing is not configured yet. Set STRIPE_* keys to enable checkout.');
  }

  async reportUsage(): Promise<void> {
    // No-op: usage is aggregated locally (UsageReporterService); the push lands with Stripe.
  }

  async syncPlan(): Promise<PlanSyncResult> {
    // Gated: the plan is fully persisted + usable locally now; the Stripe product/price is
    // created when STRIPE_* keys are set (memory: stripe-live-test-pending). Never throws — a
    // super-admin can build the whole catalog before Stripe is wired.
    return { stripeProductId: null, stripePriceId: null, synced: false };
  }
}
