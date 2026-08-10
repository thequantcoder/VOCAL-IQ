import { isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { StripeBillingProcessor } from './stripe-processor';

/**
 * Offline unit proof of the live Stripe processor: a stubbed `fetch` records every request
 * and returns canned Stripe responses, so we assert the exact endpoints, form encoding, and
 * error mapping without touching the network (mirrors the hand-rolled webhook verifier's style).
 */

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function stubFetch(
  route: (url: string, method: string) => { ok?: boolean; status?: number; body?: unknown },
) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: unknown, init: RequestInit | undefined) => {
    const method = init?.method ?? 'GET';
    calls.push({
      url: String(url),
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    const r = route(String(url), method);
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  /** Guarded accessor — asserts the nth call exists (satisfies noUncheckedIndexedAccess). */
  const at = (i: number): Recorded => {
    const c = calls[i];
    if (!c) throw new Error(`expected a Stripe call at index ${i}, got none`);
    return c;
  };
  return { fetchImpl, calls, at };
}

const checkoutReq = {
  tenantId: 'tenant-1',
  planId: 'plan-1',
  successUrl: 'https://app.example/ok',
  cancelUrl: 'https://app.example/no',
};

describe('StripeBillingProcessor.createCheckoutSession', () => {
  it('resolves the price, posts a subscription session, and returns the url', async () => {
    const { fetchImpl, calls, at } = stubFetch(() => ({
      body: { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' },
    }));
    const proc = new StripeBillingProcessor(
      { secretKey: 'sk_test_x' },
      { resolveCheckoutContext: async () => ({ stripePriceId: 'price_123' }), fetchImpl },
    );

    const { url } = await proc.createCheckoutSession(checkoutReq);
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_1');

    expect(calls).toHaveLength(1);
    const call = at(0);
    expect(call.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(call.method).toBe('POST');
    expect(call.headers.Authorization).toBe('Bearer sk_test_x');
    const form = new URLSearchParams(call.body);
    expect(form.get('mode')).toBe('subscription');
    expect(form.get('line_items[0][price]')).toBe('price_123');
    expect(form.get('client_reference_id')).toBe('tenant-1');
    expect(form.get('metadata[planId]')).toBe('plan-1');
    expect(form.get('success_url')).toBe('https://app.example/ok');
  });

  it('refuses checkout when the plan is not synced to Stripe (no price)', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ body: {} }));
    const proc = new StripeBillingProcessor(
      { secretKey: 'sk_test_x' },
      { resolveCheckoutContext: async () => ({ stripePriceId: null }), fetchImpl },
    );
    await expect(proc.createCheckoutSession(checkoutReq)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'BILLING',
    );
    expect(calls).toHaveLength(0); // never calls Stripe without a price
  });

  it('surfaces a Stripe error message as a typed BillingError on non-2xx', async () => {
    const { fetchImpl } = stubFetch(() => ({
      ok: false,
      status: 402,
      body: { error: { message: 'Your card was declined.' } },
    }));
    const proc = new StripeBillingProcessor(
      { secretKey: 'sk_test_x' },
      { resolveCheckoutContext: async () => ({ stripePriceId: 'price_123' }), fetchImpl },
    );
    await expect(proc.createCheckoutSession(checkoutReq)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'BILLING' && /declined/.test(e.message),
    );
  });
});

describe('StripeBillingProcessor.syncPlan', () => {
  const plan = {
    planId: 'plan-1',
    name: 'Pro',
    priceMonthly: 4900,
    currency: 'USD',
    stripeProductId: null,
  };

  it('creates a product then a recurring monthly price and returns both ids', async () => {
    const { fetchImpl, calls, at } = stubFetch((url) => ({
      body: url.endsWith('/v1/products')
        ? { id: 'prod_new' }
        : url.endsWith('/v1/prices')
          ? { id: 'price_new' }
          : {},
    }));
    const proc = new StripeBillingProcessor(
      { secretKey: 'sk_test_x' },
      { resolveCheckoutContext: async () => ({ stripePriceId: null }), fetchImpl },
    );

    const res = await proc.syncPlan(plan);
    expect(res).toEqual({ stripeProductId: 'prod_new', stripePriceId: 'price_new', synced: true });

    expect(calls.map((c) => c.url)).toEqual([
      'https://api.stripe.com/v1/products',
      'https://api.stripe.com/v1/prices',
    ]);
    const priceForm = new URLSearchParams(at(1).body);
    expect(priceForm.get('product')).toBe('prod_new');
    expect(priceForm.get('unit_amount')).toBe('4900');
    expect(priceForm.get('currency')).toBe('usd'); // lowercased
    expect(priceForm.get('recurring[interval]')).toBe('month');
  });

  it('updates the existing product (not re-create) when a stripeProductId is already set', async () => {
    const { fetchImpl, at } = stubFetch((url) => ({
      body: url.includes('/v1/prices') ? { id: 'price_v2' } : { id: 'prod_existing' },
    }));
    const proc = new StripeBillingProcessor(
      { secretKey: 'sk_test_x' },
      { resolveCheckoutContext: async () => ({ stripePriceId: null }), fetchImpl },
    );

    const res = await proc.syncPlan({ ...plan, stripeProductId: 'prod_existing' });
    expect(res.stripeProductId).toBe('prod_existing');
    expect(at(0).url).toBe('https://api.stripe.com/v1/products/prod_existing');
  });
});

describe('StripeBillingProcessor.reportUsage', () => {
  const push = {
    tenantId: 'tenant-1',
    subscriptionExternalId: 'sub_123',
    quantity: 42,
    periodEnd: new Date('2026-08-01T00:00:00Z'),
  };

  it('no-ops (no Stripe call) when no meter event is configured', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ body: {} }));
    const proc = new StripeBillingProcessor(
      { secretKey: 'sk_test_x' },
      { resolveCheckoutContext: async () => ({ stripePriceId: null }), fetchImpl },
    );
    await proc.reportUsage(push);
    expect(calls).toHaveLength(0);
  });

  it('resolves the customer from the subscription and posts a meter event when configured', async () => {
    const { fetchImpl, calls, at } = stubFetch((url) => ({
      body: url.includes('/v1/subscriptions/') ? { customer: 'cus_999' } : { id: 'mbe_1' },
    }));
    const proc = new StripeBillingProcessor(
      { secretKey: 'sk_test_x', meterEventName: 'overage_minutes' },
      { resolveCheckoutContext: async () => ({ stripePriceId: null }), fetchImpl },
    );

    await proc.reportUsage(push);
    expect(calls).toHaveLength(2);
    expect(at(0).method).toBe('GET');
    expect(at(0).url).toBe('https://api.stripe.com/v1/subscriptions/sub_123');
    expect(at(1).url).toBe('https://api.stripe.com/v1/billing/meter_events');
    const form = new URLSearchParams(at(1).body);
    expect(form.get('event_name')).toBe('overage_minutes');
    expect(form.get('payload[value]')).toBe('42');
    expect(form.get('payload[stripe_customer_id]')).toBe('cus_999');
    expect(at(1).headers['Idempotency-Key']).toContain('usage:sub_123:');
  });
});
