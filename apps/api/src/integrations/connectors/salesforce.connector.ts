import { type CallSyncPayload, IntegrationType, ProviderError } from '@vocaliq/shared';
import type { Connector, HttpClient, UpsertResult } from './connector';

const API = 'v59.0';

/**
 * Salesforce connector (Day 40) — contacts only (per CONNECTOR_META). Auth is an OAuth bearer access
 * token against the tenant's `instanceUrl` (from settings). A Contact is upserted by email: SOQL search
 * → PATCH update or POST create (mirrors the HubSpot find-by-email flow). `LastName` is required by
 * Salesforce, so it falls back to the company or "Unknown". Token never logged; HTTP injected.
 */
export class SalesforceConnector implements Connector {
  readonly type = IntegrationType.SALESFORCE;

  constructor(
    private readonly token: string,
    private readonly instanceUrl: string,
    private readonly http: HttpClient,
  ) {}

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  async testAuth(): Promise<boolean> {
    const res = await this.http(`${this.instanceUrl}/services/data/`, { headers: this.headers() });
    return res.ok;
  }

  async upsertContact(payload: CallSyncPayload): Promise<UpsertResult> {
    const c = payload.contact;
    const fields: Record<string, string> = {
      LastName: c.lastName || c.company || 'Unknown',
      ...(c.firstName ? { FirstName: c.firstName } : {}),
      ...(c.email ? { Email: c.email } : {}),
      ...(c.phone ? { Phone: c.phone } : {}),
    };

    const existingId = c.email ? await this.findByEmail(c.email) : null;
    if (existingId) {
      const res = await this.http(
        `${this.instanceUrl}/services/data/${API}/sobjects/Contact/${existingId}`,
        { method: 'PATCH', headers: this.headers(), body: JSON.stringify(fields) },
      );
      if (!res.ok) throw new ProviderError(`Salesforce update failed (${res.status})`);
      return { externalId: existingId };
    }

    const res = await this.http(`${this.instanceUrl}/services/data/${API}/sobjects/Contact`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new ProviderError(`Salesforce create failed (${res.status})`);
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new ProviderError('Salesforce create returned no id');
    return { externalId: body.id };
  }

  /** Find a Contact id by email via SOQL; null when none / on error. */
  private async findByEmail(email: string): Promise<string | null> {
    const soql = `SELECT Id FROM Contact WHERE Email = '${email.replace(/'/g, "\\'")}' LIMIT 1`;
    const res = await this.http(
      `${this.instanceUrl}/services/data/${API}/query?q=${encodeURIComponent(soql)}`,
      { headers: this.headers() },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { records?: { Id: string }[] };
    return body.records?.[0]?.Id ?? null;
  }
}
