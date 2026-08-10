import {
  type SlackEvent,
  type SlackSettings,
  ValidationError,
  formatSlackMessage,
  maskSlackUrl,
  slackEventEnabled,
  slackSettingsSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/** A minimal fetch-like port so the service is unit-testable offline. */
export type SlackHttp = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

const defaultHttp: SlackHttp = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(5000) });

/** Config as returned to a client — the webhook URL is masked, never echoed in full. */
export interface SlackConfigDto {
  webhookUrl: string | null;
  connected: boolean;
  events: SlackSettings['events'];
}

/**
 * Slack per-event notifications. The tenant stores a Slack Incoming Webhook URL + per-event toggles
 * (kept in the tenant settings JSON, RLS-scoped). `notify` posts a formatted message best-effort when
 * an event is enabled — a Slack outage never affects the underlying call/lead operation.
 */
export class SlackService {
  constructor(
    private readonly db: PrismaService,
    private readonly http: SlackHttp = defaultHttp,
  ) {}

  private async load(tenantId: string): Promise<SlackSettings> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const raw = (t?.settings as { slack?: unknown } | null)?.slack;
    const parsed = slackSettingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : slackSettingsSchema.parse({});
  }

  /** Current config for the dashboard (webhook URL masked). */
  async getConfig(tenantId: string): Promise<SlackConfigDto> {
    const s = await this.load(tenantId);
    return {
      webhookUrl: maskSlackUrl(s.webhookUrl || undefined),
      connected: !!s.webhookUrl,
      events: s.events ?? {},
    };
  }

  /** Save the Slack config (webhook URL + per-event toggles). */
  async setConfig(tenantId: string, input: unknown): Promise<SlackConfigDto> {
    const parsed = slackSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid Slack settings');
    }
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), slack: parsed.data };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return this.getConfig(tenantId);
  }

  /** Post a domain-event notification to Slack if configured + the event is enabled. Best-effort. */
  async notify(
    tenantId: string,
    event: SlackEvent,
    payload: Record<string, unknown>,
  ): Promise<{ delivered: boolean }> {
    const s = await this.load(tenantId);
    if (!slackEventEnabled(s, event) || !s.webhookUrl) return { delivered: false };
    try {
      const res = await this.http(s.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formatSlackMessage(event, payload)),
      });
      return { delivered: res.ok };
    } catch {
      return { delivered: false };
    }
  }

  /** Send a test message to verify the webhook works (used by the "Test" button). */
  async test(tenantId: string): Promise<{ delivered: boolean }> {
    const s = await this.load(tenantId);
    if (!s.webhookUrl) throw new ValidationError('Add a Slack webhook URL first');
    try {
      const res = await this.http(s.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: ':wave: VocalIQ is connected to this Slack channel.' }),
      });
      return { delivered: res.ok };
    } catch {
      return { delivered: false };
    }
  }
}
