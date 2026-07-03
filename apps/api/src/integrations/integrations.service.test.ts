import { type CallSyncPayload, IntegrationType, isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { Connector } from './connectors/connector';
import type { ConnectorFactory } from './connectors/factory';
import { IntegrationsService } from './integrations.service';

/**
 * Integrations (Day 40), real Postgres + RLS. Proves: connect verifies the token before
 * storing + never returns it, syncCall maps a call → contact upsert (+ ticket on negative),
 * a failing connector doesn't block others, and everything is tenant-scoped.
 */

const db = new PrismaService();

// A spy connector so we assert dispatch + payload mapping without any live CRM.
const calls: { upsert: CallSyncPayload[]; ticket: CallSyncPayload[] } = { upsert: [], ticket: [] };
const spyConnector: Connector = {
  type: IntegrationType.HUBSPOT,
  testAuth: async () => true,
  upsertContact: async (p) => {
    calls.upsert.push(p);
    return { externalId: 'hs-123' };
  },
  createTicket: async (p) => {
    calls.ticket.push(p);
    return { externalId: 'ticket-9' };
  },
};
const spyFactory: ConnectorFactory = () => spyConnector;
const svc = new IntegrationsService(db, spyFactory);

const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002'; // C1's parent reseller
const AGENT = '00000000-0000-0000-0000-0000003c0001';
const CONTACT = '00000000-0000-0000-0000-0000003c0002';
const CALL = '00000000-0000-0000-0000-0000003c0003';
const R1_AGENT = '00000000-0000-0000-0000-0000003c0004';
const CALL_R1 = '00000000-0000-0000-0000-0000003c0005';
const created: string[] = [];

beforeAll(async () => {
  const a = db.admin;
  await a.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Integ Agent' },
    update: {},
  });
  await a.contact.upsert({
    where: { id: CONTACT },
    create: {
      id: CONTACT,
      tenantId: C1,
      name: 'Ada Lovelace',
      email: 'ada@x.com',
      phone: '+14155550100',
    },
    update: {},
  });
  await a.lead.create({
    data: { tenantId: C1, contactId: CONTACT, status: 'QUALIFIED', score: 80 },
  });
  await a.call.upsert({
    where: { id: CALL },
    create: {
      id: CALL,
      tenantId: C1,
      agentId: AGENT,
      contactId: CONTACT,
      direction: 'INBOUND',
      channel: 'PSTN',
      status: 'COMPLETED',
    },
    update: {},
  });
  await a.transcript.upsert({
    where: { callId: CALL },
    create: {
      callId: CALL,
      tenantId: C1,
      summary: 'Wants a demo.',
      sentiment: 'negative',
      keywords: ['demo'],
    },
    update: {},
  });
  // A call owned by the PARENT reseller (R1) — the child C1 must not be able to sync it.
  await a.agent.upsert({
    where: { id: R1_AGENT },
    create: { id: R1_AGENT, tenantId: R1, name: 'Parent Agent' },
    update: {},
  });
  await a.call.upsert({
    where: { id: CALL_R1 },
    create: {
      id: CALL_R1,
      tenantId: R1,
      agentId: R1_AGENT,
      direction: 'INBOUND',
      channel: 'PSTN',
      status: 'COMPLETED',
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.integration.deleteMany({ where: { id: { in: created } } });
  await db.admin.integration.deleteMany({ where: { tenantId: { in: [C1, R1] }, type: 'HUBSPOT' } });
  await db.admin.transcript.deleteMany({ where: { callId: CALL } });
  await db.admin.call.deleteMany({ where: { id: { in: [CALL, CALL_R1] } } });
  await db.admin.lead.deleteMany({ where: { contactId: CONTACT } });
  await db.admin.contact.deleteMany({ where: { id: CONTACT } });
  await db.admin.agent.deleteMany({ where: { id: { in: [AGENT, R1_AGENT] } } });
});

describe('IntegrationsService', () => {
  it('connects HubSpot (token verified + never returned) and lists it masked', async () => {
    const dto = await svc.connect(C1, {
      type: 'HUBSPOT',
      accessToken: 'pat-na1-secrettoken',
      ticketOnNegative: true,
    });
    created.push(dto.id);
    expect(dto.type).toBe('HUBSPOT');
    expect(JSON.stringify(dto)).not.toContain('secrettoken'); // token never leaves the service

    const list = await svc.list(C1);
    expect(JSON.stringify(list)).not.toContain('secrettoken');
    expect(list.find((i) => i.type === 'HUBSPOT')?.ticketOnNegative).toBe(true);
  });

  it('rejects an unimplemented provider and a bad token', async () => {
    await expect(
      svc.connect(C1, { type: 'SALESFORCE', accessToken: 'longenough' }),
    ).rejects.toSatisfy(isAppError);
    const badFactory: ConnectorFactory = () => ({ ...spyConnector, testAuth: async () => false });
    const badSvc = new IntegrationsService(db, badFactory);
    await expect(
      badSvc.connect(C1, { type: 'HUBSPOT', accessToken: 'pat-na1-bad' }),
    ).rejects.toSatisfy(isAppError);
  });

  it('syncs a call: upserts the contact and opens a ticket on a negative call', async () => {
    calls.upsert.length = 0;
    calls.ticket.length = 0;
    const res = await svc.syncCall(C1, CALL);
    expect(res.synced).toHaveLength(1);
    expect(res.synced[0]).toMatchObject({
      type: 'HUBSPOT',
      contactId: 'hs-123',
      ticketId: 'ticket-9',
    });

    // The mapped payload carried the contact + qualification + negative-sentiment ticket flag.
    expect(calls.upsert[0]?.contact.email).toBe('ada@x.com');
    expect(calls.upsert[0]?.leadStatus).toBe('QUALIFIED');
    expect(calls.upsert[0]?.openTicket).toBe(true);
    expect(calls.ticket).toHaveLength(1);
  });

  it('a failing connector is skipped, not fatal', async () => {
    const throwingFactory: ConnectorFactory = () => ({
      ...spyConnector,
      upsertContact: async () => {
        throw new Error('HubSpot 500');
      },
    });
    const res = await new IntegrationsService(db, throwingFactory).syncCall(C1, CALL);
    expect(res.synced).toHaveLength(0);
    expect(res.skipped[0]?.reason).toContain('HubSpot 500');
  });

  it("child tenant can't reach the parent reseller's call for sync (RLS)", async () => {
    // CALL_R1 belongs to R1 (parent); C1 is its child → RLS hides the parent's call.
    await expect(svc.syncCall(C1, CALL_R1)).rejects.toSatisfy(isAppError);
  });
});
