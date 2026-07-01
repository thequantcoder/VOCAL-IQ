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

export interface BillingProcessor {
  readonly name: string;
  createCheckoutSession(req: CheckoutRequest): Promise<{ url: string }>;
  reportUsage(push: UsagePush): Promise<void>;
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
}
