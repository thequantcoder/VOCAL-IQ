import { type CallSyncPayload, IntegrationType, ProviderError } from '@vocaliq/shared';
import type { Connector, HttpClient, UpsertResult } from './connector';

/**
 * Zendesk connector (Day 40). Auth is an OAuth bearer token; the tenant's `subdomain` (from settings)
 * forms the base `https://{subdomain}.zendesk.com`. A contact is upserted via `create_or_update` (keyed
 * on email), and a support ticket is opened for the call when asked. Token never logged; HTTP injected.
 */
export class ZendeskConnector implements Connector {
  readonly type = IntegrationType.ZENDESK;
  private readonly base: string;

  constructor(
    private readonly token: string,
    subdomain: string,
    private readonly http: HttpClient,
  ) {
    this.base = `https://${subdomain}.zendesk.com`;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  async testAuth(): Promise<boolean> {
    const res = await this.http(`${this.base}/api/v2/users/me.json`, { headers: this.headers() });
    return res.ok;
  }

  async upsertContact(payload: CallSyncPayload): Promise<UpsertResult> {
    const c = payload.contact;
    const name =
      [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.phone || 'Unknown caller';
    const res = await this.http(`${this.base}/api/v2/users/create_or_update.json`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        user: {
          name,
          ...(c.email ? { email: c.email } : {}),
          ...(c.phone ? { phone: c.phone } : {}),
        },
      }),
    });
    if (!res.ok) throw new ProviderError(`Zendesk user upsert failed (${res.status})`);
    const body = (await res.json()) as { user?: { id?: number } };
    return { externalId: String(body.user?.id ?? '') };
  }

  async createTicket(payload: CallSyncPayload): Promise<UpsertResult> {
    const res = await this.http(`${this.base}/api/v2/tickets.json`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        ticket: {
          subject: `Call follow-up — ${payload.leadStatus.toLowerCase()}`,
          comment: { body: payload.note },
          priority: payload.sentiment === 'negative' ? 'high' : 'normal',
        },
      }),
    });
    if (!res.ok) throw new ProviderError(`Zendesk ticket failed (${res.status})`);
    const body = (await res.json()) as { ticket?: { id?: number } };
    return { externalId: String(body.ticket?.id ?? '') };
  }
}
