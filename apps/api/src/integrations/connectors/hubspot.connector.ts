import {
  type CallSyncPayload,
  IntegrationType,
  ProviderError,
  hubspotContactProps,
} from '@vocaliq/shared';
import type { Connector, HttpClient, UpsertResult } from './connector';

const BASE = 'https://api.hubapi.com';

/**
 * HubSpot connector (Day 40) — the reference implementation. Uses a tenant-supplied private-
 * app token (BYO). Contacts are upserted by email search → create/update; a call note is
 * attached; a ticket is opened when the payload asks for it. The token is passed in already
 * decrypted; it is never logged. HTTP is injected (`fetchHttp` in prod, a fake in tests).
 */
export class HubSpotConnector implements Connector {
  readonly type = IntegrationType.HUBSPOT;

  constructor(
    private readonly token: string,
    private readonly http: HttpClient,
  ) {}

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  async testAuth(): Promise<boolean> {
    const res = await this.http(`${BASE}/crm/v3/objects/contacts?limit=1`, {
      headers: this.headers(),
    });
    return res.ok;
  }

  async upsertContact(payload: CallSyncPayload): Promise<UpsertResult> {
    const props = hubspotContactProps(payload);
    const existingId = payload.contact.email ? await this.findByEmail(payload.contact.email) : null;

    if (existingId) {
      const res = await this.http(`${BASE}/crm/v3/objects/contacts/${existingId}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ properties: props }),
      });
      if (!res.ok) throw new ProviderError(`HubSpot update failed (${res.status})`);
      return { externalId: existingId };
    }

    const res = await this.http(`${BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ properties: props }),
    });
    if (!res.ok) throw new ProviderError(`HubSpot create failed (${res.status})`);
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new ProviderError('HubSpot create returned no id');
    return { externalId: body.id };
  }

  async createTicket(payload: CallSyncPayload): Promise<UpsertResult> {
    const res = await this.http(`${BASE}/crm/v3/objects/tickets`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        properties: {
          subject: `Call follow-up — ${payload.leadStatus.toLowerCase()}`,
          content: payload.note,
          hs_pipeline_stage: '1',
          hs_ticket_priority: payload.sentiment === 'negative' ? 'HIGH' : 'MEDIUM',
        },
      }),
    });
    if (!res.ok) throw new ProviderError(`HubSpot ticket failed (${res.status})`);
    const body = (await res.json()) as { id?: string };
    return { externalId: body.id ?? '' };
  }

  /** Find a contact id by email via the search API; null when none. */
  private async findByEmail(email: string): Promise<string | null> {
    const res = await this.http(`${BASE}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        limit: 1,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: { id: string }[] };
    return body.results?.[0]?.id ?? null;
  }
}
