import { BillingError } from '@vocaliq/shared';
import type {
  BillingProcessor,
  CheckoutRequest,
  PlanSync,
  PlanSyncResult,
  UsagePush,
} from './processor';

const STRIPE_API = 'https://api.stripe.com';

/**
 * Context the Stripe processor needs from the app DB to open a checkout. Resolved by
 * composition (which reads `Plan.stripePriceId`) so the processor itself stays Prisma-free
 * and fully unit-testable with a stub resolver + injected `fetch`.
 */
export interface CheckoutContext {
  /** The Stripe recurring price to subscribe to (from `Plan.stripePriceId`; null ⇒ not synced). */
  stripePriceId: string | null;
  /** Pre-fill the Stripe Checkout email, if the app knows the billing contact. */
  customerEmail?: string | null;
}

export type CheckoutContextResolver = (req: CheckoutRequest) => Promise<CheckoutContext>;

export interface StripeConfig {
  secretKey: string;
  /**
   * Optional: enables usage reporting via the Billing Meter Events API. Must equal the
   * `event_name` of a Stripe meter. When unset, `reportUsage` is a safe no-op (flat monthly
   * plans don't need it; local aggregation still happens in UsageReporterService).
   */
  meterEventName?: string;
}

export interface StripeDeps {
  resolveCheckoutContext: CheckoutContextResolver;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const epoch = (d: Date): number => Math.floor(d.getTime() / 1000);

/**
 * Live Stripe implementation of the provider-agnostic BillingProcessor seam (golden rule #2).
 * Uses raw form-encoded calls to the Stripe REST API — no SDK, matching the hand-rolled,
 * offline-testable webhook verifier (`stripe-webhook.ts`). Bound in composition only when
 * `STRIPE_SECRET_KEY` is set; otherwise `PendingBillingProcessor` stays in place.
 *
 * Auth is `Authorization: Bearer <secret>` (Stripe accepts bearer). The secret is never logged;
 * a non-2xx surfaces Stripe's safe `error.message` as a typed `BillingError`.
 */
export class StripeBillingProcessor implements BillingProcessor {
  readonly name = 'stripe';
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly cfg: StripeConfig,
    private readonly deps: StripeDeps,
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  /** Open a Stripe-hosted subscription Checkout. `client_reference_id`/metadata carry the
   * tenant + plan so the webhook (`checkout.session.completed`) can link the subscription back. */
  async createCheckoutSession(req: CheckoutRequest): Promise<{ url: string }> {
    const ctx = await this.deps.resolveCheckoutContext(req);
    if (!ctx.stripePriceId) {
      throw new BillingError(
        'This plan is not synced to Stripe yet. Sync the plan, then retry checkout.',
      );
    }
    const form: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price]': ctx.stripePriceId,
      'line_items[0][quantity]': '1',
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      client_reference_id: req.tenantId,
      'metadata[tenantId]': req.tenantId,
      'metadata[planId]': req.planId,
      'subscription_data[metadata][tenantId]': req.tenantId,
      'subscription_data[metadata][planId]': req.planId,
    };
    if (ctx.customerEmail) form.customer_email = ctx.customerEmail;

    const session = await this.call<{ url?: string }>('/v1/checkout/sessions', form);
    if (!session.url) throw new BillingError('Stripe did not return a checkout URL.');
    return { url: session.url };
  }

  /** Mirror a plan into Stripe: create/update the Product, then create a fresh recurring
   * monthly Price (Stripe prices are immutable, so each sync mints a new price). */
  async syncPlan(plan: PlanSync): Promise<PlanSyncResult> {
    const product = plan.stripeProductId
      ? await this.call<{ id: string }>(`/v1/products/${plan.stripeProductId}`, {
          name: plan.name,
          'metadata[planId]': plan.planId,
        })
      : await this.call<{ id: string }>('/v1/products', {
          name: plan.name,
          'metadata[planId]': plan.planId,
        });

    const price = await this.call<{ id: string }>('/v1/prices', {
      product: product.id,
      unit_amount: String(plan.priceMonthly),
      currency: plan.currency.toLowerCase(),
      'recurring[interval]': 'month',
    });

    return { stripeProductId: product.id, stripePriceId: price.id, synced: true };
  }

  /** Report metered overage via the current Billing Meter Events API (the legacy
   * `usage_records` API is removed in Stripe 2025-03-31+). No-op when no meter is configured. */
  async reportUsage(push: UsagePush): Promise<void> {
    if (!this.cfg.meterEventName) return; // flat monthly plans — nothing to meter to Stripe.
    // Meter events are keyed by customer, so resolve it from the subscription.
    const sub = await this.call<{ customer?: unknown }>(
      `/v1/subscriptions/${push.subscriptionExternalId}`,
      undefined,
      { method: 'GET' },
    );
    const customer = str(sub.customer);
    if (!customer) return;
    const idempotent = `usage:${push.subscriptionExternalId}:${epoch(push.periodEnd)}`;
    await this.call(
      '/v1/billing/meter_events',
      {
        event_name: this.cfg.meterEventName,
        'payload[value]': String(push.quantity),
        'payload[stripe_customer_id]': customer,
        identifier: idempotent,
      },
      { idempotencyKey: idempotent },
    );
  }

  /** One form-encoded Stripe REST call. Bearer auth; typed `BillingError` on non-2xx; no secret logged. */
  private async call<T>(
    path: string,
    form?: Record<string, string>,
    opts: { method?: string; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.secretKey}` };
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const init: RequestInit = { method: opts.method ?? 'POST', headers };
    if (form) init.body = new URLSearchParams(form).toString();
    const res = await this.fetchImpl(`${STRIPE_API}${path}`, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) {
      throw new BillingError(data?.error?.message ?? `Stripe request failed (${res.status}).`);
    }
    return data;
  }
}
