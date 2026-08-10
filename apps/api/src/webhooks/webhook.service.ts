import { randomBytes } from 'node:crypto';
import {
  NotFoundError,
  ValidationError,
  type WebhookEvent,
  checkPublicHttpUrl,
  isWebhookEvent,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import { signWebhook } from './webhook-sign';

/**
 * Outbound webhooks (Day 48). Tenant-scoped endpoints subscribe to events; `deliver` signs a
 * payload (HMAC-SHA256 over timestamp.body), POSTs it, RETRIES on failure, and DEAD-LETTERS
 * after the max attempts — returning a per-endpoint result the caller can log. The URL is
 * SSRF-guarded on registration; the secret is stored server-side + never returned. HTTP + clock
 * are injected so retry/dead-letter is deterministically unit-tested (self-audit C).
 */

export type WebhookHttp = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export const fetchWebhookHttp: WebhookHttp = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
};

const MAX_ATTEMPTS = 3;

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
}

export interface DeliveryResult {
  webhookId: string;
  delivered: boolean;
  attempts: number;
  deadLettered: boolean;
  lastStatus: number;
}

export class WebhookService {
  constructor(
    private readonly db: PrismaService,
    private readonly http: WebhookHttp = fetchWebhookHttp,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async register(
    tenantId: string,
    input: { url: string; events: string[]; secret?: string },
  ): Promise<WebhookRow & { secret: string }> {
    const check = checkPublicHttpUrl(input.url);
    if (!check.ok) throw new ValidationError(`Unsafe webhook URL: ${check.reason}`);
    const events = input.events.filter(isWebhookEvent);
    if (events.length === 0) throw new ValidationError('At least one valid event is required');
    const secret = input.secret?.trim() || `whsec_${randomBytes(24).toString('hex')}`;

    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.webhook.create({
        data: { tenantId, url: input.url, events, secret: Buffer.from(secret, 'utf8') },
        select: SELECT,
      }),
    );
    return { ...toRow(row), secret }; // secret returned ONCE at registration
  }

  async list(tenantId: string): Promise<WebhookRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.webhook.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT }),
    );
    return rows.map(toRow);
  }

  async remove(tenantId: string, id: string): Promise<{ deleted: true }> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.webhook.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Webhook not found');
    await this.db.withTenant(tenantId, (tx) => tx.webhook.delete({ where: { id } }));
    return { deleted: true };
  }

  /**
   * Deliver an event to every active endpoint subscribed to it. Signs the body, retries up to
   * MAX_ATTEMPTS, and dead-letters (audited) if all attempts fail. Best-effort per endpoint.
   */
  async deliver(
    tenantId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<DeliveryResult[]> {
    const hooks = await this.db.withTenant(tenantId, (tx) =>
      tx.webhook.findMany({
        where: { active: true, events: { has: event } },
        select: { id: true, url: true, secret: true },
      }),
    );

    const results: DeliveryResult[] = [];
    for (const hook of hooks) {
      const secret = Buffer.from(hook.secret).toString('utf8');
      const timestamp = Math.floor(this.now() / 1000);
      const body = JSON.stringify({ event, data: payload, timestamp });
      const signature = signWebhook(secret, body, timestamp);

      let delivered = false;
      let attempts = 0;
      let lastStatus = 0;
      for (let i = 0; i < MAX_ATTEMPTS && !delivered; i++) {
        attempts += 1;
        const res = await this.http(hook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-VocalIQ-Event': event,
            'X-VocalIQ-Signature': signature,
            'X-VocalIQ-Timestamp': String(timestamp),
          },
          body,
        });
        lastStatus = res.status;
        if (res.ok) delivered = true;
      }

      const deadLettered = !delivered;
      if (deadLettered) {
        await this.db.withTenant(tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId,
              action: 'webhook.dead_letter',
              target: hook.id,
              meta: { event, attempts, lastStatus } as object,
            },
          }),
        );
      }
      results.push({ webhookId: hook.id, delivered, attempts, deadLettered, lastStatus });
    }
    return results;
  }
}

const SELECT = { id: true, url: true, events: true, active: true, createdAt: true } as const;

function toRow(r: {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
}): WebhookRow {
  return r;
}
