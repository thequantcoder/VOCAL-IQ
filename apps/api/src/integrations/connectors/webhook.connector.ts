import { type CallSyncPayload, type IntegrationType, ProviderError } from '@vocaliq/shared';
import type { Connector, HttpClient, UpsertResult } from './connector';

/**
 * Generic outbound-webhook connector (Day 40) — backs both WEBHOOK and Zapier catch-hooks (ZAPIER),
 * which are the same thing: an authenticated JSON POST of the normalized {@link CallSyncPayload} to the
 * tenant's configured URL. No provider id comes back, so the contact's email is echoed as the external
 * ref. An optional bearer token (from settings) is sent when present; it is never logged. HTTP injected.
 */
export class WebhookConnector implements Connector {
  constructor(
    readonly type: IntegrationType,
    private readonly url: string,
    private readonly http: HttpClient,
    private readonly token?: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async testAuth(): Promise<boolean> {
    const res = await this.http(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'vocaliq.test', ok: true }),
    });
    return res.ok;
  }

  async upsertContact(payload: CallSyncPayload): Promise<UpsertResult> {
    const res = await this.http(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new ProviderError(`Webhook POST failed (${res.status})`);
    return { externalId: payload.contact.email ?? payload.contact.phone ?? '' };
  }
}
