import { ValidationError, messageCampaignSchema } from '@vocaliq/shared';
import type { MessagingService } from './messaging.service';

/**
 * Message campaigns (GME-17) — send one template/body to a list, consent-gated + quiet-hours-respecting
 * by default. A thin orchestrator over `MessagingService.send()` so EVERY recipient still routes through
 * the unified `MessagingGuard` (consent → opt-out → DNC → quiet-hours) and is metered. Recipients are
 * de-duplicated; a gate refusal (a `ValidationError` from the guard) is reported as `skipped` with its
 * reason (never a silent drop), a QUEUED send (no provider configured) is skipped too, and any other
 * error counts as `failed`. Synchronous + list-capped (500) — a large paced campaign belongs on the
 * durable async queue (deferred).
 */

export interface MessageCampaignResult {
  total: number;
  sent: number;
  skipped: Array<{ to: string; reason: string }>;
  failed: number;
}

export class MessageCampaignService {
  constructor(private readonly messaging: MessagingService) {}

  async send(tenantId: string, input: unknown): Promise<MessageCampaignResult> {
    const parsed = messageCampaignSchema.parse(input);
    const unique = [...new Set(parsed.recipients)];
    const result: MessageCampaignResult = { total: unique.length, sent: 0, skipped: [], failed: 0 };

    for (const to of unique) {
      try {
        const msg = await this.messaging.send(tenantId, {
          channel: parsed.channel,
          to,
          ...(parsed.templateId ? { templateId: parsed.templateId } : {}),
          ...(parsed.body ? { body: parsed.body } : {}),
          ...(parsed.variables ? { variables: parsed.variables } : {}),
          ...(parsed.campaignId ? { campaignId: parsed.campaignId } : {}),
          requireConsent: parsed.requireConsent,
          respectQuietHours: parsed.respectQuietHours,
        });
        if (msg.status === 'SENT') result.sent += 1;
        else result.skipped.push({ to, reason: msg.error ?? msg.status }); // QUEUED (gated) / etc.
      } catch (err) {
        // A guard refusal (consent/opt-out/DNC/quiet-hours) or a missing template variable is a
        // per-recipient skip; anything else is a hard failure for that recipient.
        if (err instanceof ValidationError) {
          result.skipped.push({ to, reason: (err as Error).message });
        } else {
          result.failed += 1;
        }
      }
    }
    return result;
  }
}
