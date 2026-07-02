import { ValidationError } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import { mapEventToStatus, verifyStripeSignature } from './stripe-webhook';

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
}
