import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { DialRequest, Dialer } from './dialer';
import { InstantDialService } from './instant-dial.service';
import { OutboundService } from './outbound.service';

/**
 * Instant-dial (real Postgres, RLS-scoped). Proves: a bare phone number auto-creates a deduped
 * Contact + Lead, the vetted outbound path places a QUEUED call + dispatches to the dialer, a
 * second dial to the same number reuses the contact + lead, and everything is tenant-scoped.
 */

const db = new PrismaService();

class FakeDialer implements Dialer {
  readonly dispatched: DialRequest[] = [];
  async dial(req: DialRequest): Promise<void> {
    this.dispatched.push(req);
  }
}

const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT = '00000000-0000-0000-0000-0000001b0001';
const TO = '+15551239001';

const base = { agentId: AGENT, to: TO, consentBasis: 'EXPRESS_WRITTEN' as const };

beforeAll(async () => {
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Instant Dial Agent' },
    update: {},
  });
});

afterEach(async () => {
  await db.admin.call.deleteMany({ where: { agentId: AGENT } });
  await db.admin.lead.deleteMany({ where: { tenantId: C1, contact: { phone: TO } } });
  await db.admin.contact.deleteMany({ where: { tenantId: C1, phone: TO } });
});

afterAll(async () => {
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
});

function svc(dialer: Dialer = new FakeDialer()) {
  const emitted: { event: string; payload: Record<string, unknown> }[] = [];
  const emit = async (_t: string, event: string, payload: Record<string, unknown>) => {
    emitted.push({ event, payload });
  };
  const outbound = new OutboundService(db, dialer, undefined, emit);
  return { service: new InstantDialService(db, outbound, emit), dialer, emitted };
}

describe('InstantDialService.dial', () => {
  it('auto-creates a deduped Contact + Lead from a phone number and dispatches a QUEUED call', async () => {
    const { service, dialer } = svc();
    const res = await service.dial(C1, { ...base, name: 'Jane Doe', fields: { plan: 'pro' } });

    expect(res.status).toBe('QUEUED');
    expect(res.callId).toBeTruthy();
    expect(res.leadId).toBeTruthy();
    expect(res.contactId).toBeTruthy();

    const contact = await db.admin.contact.findFirst({ where: { tenantId: C1, phone: TO } });
    expect(contact?.name).toBe('Jane Doe');
    expect((contact?.fields as Record<string, unknown>).plan).toBe('pro');
    expect(contact?.source).toBe('instant-dial');

    const leads = await db.admin.lead.count({ where: { contactId: res.contactId } });
    expect(leads).toBe(1);

    // The vetted outbound path dispatched the call to the dialer.
    expect((dialer as FakeDialer).dispatched).toHaveLength(1);
    expect((dialer as FakeDialer).dispatched[0]!.to).toBe(TO);
  });

  it('emits a lead.created webhook event for a newly-created lead', async () => {
    const { service, emitted } = svc();
    await service.dial(C1, base);
    expect(emitted.map((e) => e.event)).toContain('lead.created');
    expect(emitted.find((e) => e.event === 'lead.created')?.payload.phone).toBe(TO);
  });

  it('reuses the existing Contact + Lead on a second dial to the same number (dedupe)', async () => {
    const { service } = svc();
    const first = await service.dial(C1, base);
    const second = await service.dial(C1, { ...base, name: 'Later Name' });

    expect(second.contactId).toBe(first.contactId);
    expect(second.leadId).toBe(first.leadId);

    const contacts = await db.admin.contact.count({ where: { tenantId: C1, phone: TO } });
    expect(contacts).toBe(1);
    const leads = await db.admin.lead.count({ where: { contactId: first.contactId } });
    expect(leads).toBe(1);
  });

  it('rejects an invalid request (missing consent basis)', async () => {
    const { service } = svc();
    await expect(service.dial(C1, { agentId: AGENT, to: TO })).rejects.toThrow(/required|consent/i);
  });

  it('rejects a non-E.164 destination', async () => {
    const { service } = svc();
    await expect(service.dial(C1, { ...base, to: '5551234' })).rejects.toThrow(/E\.164/i);
  });
});
