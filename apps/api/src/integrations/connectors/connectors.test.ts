import { type CallSyncPayload, IntegrationType, isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import type { HttpClient } from './connector';
import { defaultConnectorFactory } from './factory';
import { SalesforceConnector } from './salesforce.connector';
import { WebhookConnector } from './webhook.connector';
import { ZendeskConnector } from './zendesk.connector';

/**
 * Offline unit proof of the non-HubSpot connectors (Webhook/Zapier, Zendesk, Salesforce) + the factory
 * that wires them from settings. A fake `HttpClient` records each call + returns canned responses, so we
 * assert the endpoints/auth/body and the external-id mapping — no network.
 */

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | undefined;
}

function fakeHttp(
  responder: (url: string, method: string) => { ok?: boolean; status?: number; json?: unknown },
) {
  const calls: Recorded[] = [];
  const http: HttpClient = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      body: init?.body,
    });
    const r = responder(url, init?.method ?? 'GET');
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json ?? {} };
  };
  return { http, calls };
}

const payload: CallSyncPayload = {
  contact: { email: 'jane@acme.com', firstName: 'Jane', lastName: 'Doe', phone: '+15551230001' },
  leadStatus: 'QUALIFIED',
  leadScore: 80,
  sentiment: 'negative',
  summary: 'Wants a demo',
  keywords: ['demo'],
  note: 'Call went well; follow up.',
  openTicket: true,
};

describe('WebhookConnector (WEBHOOK/ZAPIER)', () => {
  it('POSTs the payload to the configured url and echoes the email as external id', async () => {
    const { http, calls } = fakeHttp(() => ({ ok: true }));
    const res = await new WebhookConnector(
      IntegrationType.WEBHOOK,
      'https://hooks.example.com/x',
      http,
    ).upsertContact(payload);
    expect(res.externalId).toBe('jane@acme.com');
    expect(calls[0]?.url).toBe('https://hooks.example.com/x');
    expect(calls[0]?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.body ?? '{}').leadStatus).toBe('QUALIFIED');
  });

  it('raises on a non-2xx', async () => {
    const { http } = fakeHttp(() => ({ ok: false, status: 500 }));
    await expect(
      new WebhookConnector(IntegrationType.ZAPIER, 'https://z/x', http).upsertContact(payload),
    ).rejects.toSatisfy((e) => isAppError(e));
  });
});

describe('ZendeskConnector', () => {
  it('upserts a user via create_or_update and opens a ticket', async () => {
    const { http, calls } = fakeHttp((url) =>
      url.includes('create_or_update')
        ? { json: { user: { id: 55 } } }
        : { json: { ticket: { id: 99 } } },
    );
    const c = new ZendeskConnector('tok', 'acme', http);
    const user = await c.upsertContact(payload);
    const ticket = await c.createTicket(payload);
    expect(user.externalId).toBe('55');
    expect(ticket.externalId).toBe('99');
    expect(calls[0]?.url).toBe('https://acme.zendesk.com/api/v2/users/create_or_update.json');
    expect(calls[0]?.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0]?.body ?? '{}').user).toMatchObject({
      name: 'Jane Doe',
      email: 'jane@acme.com',
    });
    expect(calls[1]?.url).toBe('https://acme.zendesk.com/api/v2/tickets.json');
    expect(JSON.parse(calls[1]?.body ?? '{}').ticket.priority).toBe('high'); // negative sentiment
  });
});

describe('SalesforceConnector', () => {
  it('updates an existing Contact found by email (SOQL → PATCH)', async () => {
    const { http, calls } = fakeHttp((url) =>
      url.includes('/query') ? { json: { records: [{ Id: '003xx' }] } } : { ok: true, status: 204 },
    );
    const res = await new SalesforceConnector(
      'tok',
      'https://acme.my.salesforce.com',
      http,
    ).upsertContact(payload);
    expect(res.externalId).toBe('003xx');
    expect(calls[0]?.url).toContain('/services/data/v59.0/query?q=');
    expect(calls[1]?.method).toBe('PATCH');
    expect(calls[1]?.url).toBe(
      'https://acme.my.salesforce.com/services/data/v59.0/sobjects/Contact/003xx',
    );
    expect(JSON.parse(calls[1]?.body ?? '{}')).toMatchObject({
      LastName: 'Doe',
      Email: 'jane@acme.com',
    });
  });

  it('creates a Contact when none exists (SOQL empty → POST)', async () => {
    const { http, calls } = fakeHttp((url) =>
      url.includes('/query') ? { json: { records: [] } } : { json: { id: '003new' } },
    );
    const res = await new SalesforceConnector(
      'tok',
      'https://acme.my.salesforce.com',
      http,
    ).upsertContact({
      ...payload,
      contact: { email: 'new@acme.com', company: 'Acme' }, // no last name → falls back to company
    });
    expect(res.externalId).toBe('003new');
    expect(calls[1]?.method).toBe('POST');
    expect(JSON.parse(calls[1]?.body ?? '{}').LastName).toBe('Acme');
  });
});

describe('defaultConnectorFactory', () => {
  const f = defaultConnectorFactory();
  it('builds the right connector per type when its settings are present', () => {
    expect(f(IntegrationType.ZENDESK, 't', { subdomain: 'acme' })).toBeInstanceOf(ZendeskConnector);
    expect(f(IntegrationType.SALESFORCE, 't', { instanceUrl: 'https://x' })).toBeInstanceOf(
      SalesforceConnector,
    );
    expect(f(IntegrationType.WEBHOOK, 't', { url: 'https://x' })).toBeInstanceOf(WebhookConnector);
    expect(f(IntegrationType.ZAPIER, 't', { url: 'https://x' })).toBeInstanceOf(WebhookConnector);
  });

  it('returns null when the required setting is missing, and for GOOGLE (no capability)', () => {
    expect(f(IntegrationType.ZENDESK, 't', {})).toBeNull();
    expect(f(IntegrationType.SALESFORCE, 't', {})).toBeNull();
    expect(f(IntegrationType.WEBHOOK, 't', {})).toBeNull();
    expect(f(IntegrationType.GOOGLE, 't', {})).toBeNull();
  });
});
