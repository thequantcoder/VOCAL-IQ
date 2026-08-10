import { SubscriptionStatus, ValidationError } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import { mapEventToStatus, verifyStripeSignature } from './stripe-webhook';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Stripe webhook handler (self-audit focus C). Verifies the signature over the RAW body,
 * dedupes by event id (idempotent — Stripe re-delivers), then applies the subscription
 * status transition. Webhooks span tenants, so the subscription is looked up + updated
 * via the admin client keyed by its Stripe `externalId`.
 */

export interface ProcessedEvents {
  seen(eventId: string): Promise<boolean>;
  mark(eventId: string): Promise<void>;
}

/** In-memory dedupe (single node). A durable store (Redis/table) lands with scale. */
export class InMemoryProcessedEvents implements ProcessedEvents {
  private readonly ids = new Set<string>();
  async seen(id: string): Promise<boolean> {
    return this.ids.has(id);
  }
  async mark(id: string): Promise<void> {
    this.ids.add(id);
  }
}

export class BillingWebhookService {
  constructor(
    private readonly db: PrismaService,
    private readonly processed: ProcessedEvents = new InMemoryProcessedEvents(),
  ) {}

  async handle(
    rawBody: string,
    signature: string | undefined,
    secret: string,
  ): Promise<{ status: string; eventId?: string }> {
    const verified = verifyStripeSignature(rawBody, signature, secret);
    if (!verified.ok) throw new ValidationError('Invalid webhook signature');

    let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new ValidationError('Invalid webhook payload');
    }
    const eventId = event.id;
    if (!eventId || !event.type) throw new ValidationError('Malformed webhook event');

    if (await this.processed.seen(eventId)) return { status: 'duplicate', eventId };

    // First paid checkout: the local Subscription row has no Stripe id yet, so the status-only
    // events below can't find it. `checkout.session.completed` carries the tenant (client_reference_id
    // / metadata) + the new Stripe subscription id, so we LINK them here before any status sync.
    if (event.type === 'checkout.session.completed') {
      const obj = event.data?.object ?? {};
      const meta = (obj.metadata ?? {}) as Record<string, unknown>;
      const tenantId = str(obj.client_reference_id) ?? str(meta.tenantId);
      const subExternalId = str(obj.subscription);
      const planId = str(meta.planId);
      if (tenantId && subExternalId) await this.linkSubscription(tenantId, subExternalId, planId);
      await this.processed.mark(eventId);
      return { status: 'linked', eventId };
    }

    const status = mapEventToStatus(event.type);
    if (status) {
      const obj = event.data?.object ?? {};
      const externalId =
        (typeof obj.subscription === 'string' ? obj.subscription : undefined) ??
        (typeof obj.id === 'string' ? obj.id : undefined);
      if (externalId) {
        await this.db.admin.subscription.updateMany({ where: { externalId }, data: { status } });
      }
    }

    await this.processed.mark(eventId);
    return { status: status ?? 'ignored', eventId };
  }

  /**
   * Link the tenant's subscription to the freshly-created Stripe subscription. Updates the
   * tenant's latest row (e.g. the TRIALING free-plan seed) to the paid plan + ACTIVE, or
   * creates one when none exists. Cross-tenant (webhook), so the admin client is used.
   */
  private async linkSubscription(
    tenantId: string,
    externalId: string,
    planId?: string,
  ): Promise<void> {
    const existing = await this.db.admin.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      await this.db.admin.subscription.update({
        where: { id: existing.id },
        data: {
          externalId,
          processor: 'stripe',
          status: SubscriptionStatus.ACTIVE,
          ...(planId ? { planId } : {}),
        },
      });
    } else if (planId) {
      await this.db.admin.subscription.create({
        data: {
          tenantId,
          planId,
          externalId,
          processor: 'stripe',
          status: SubscriptionStatus.ACTIVE,
        },
      });
    }
  }
}
