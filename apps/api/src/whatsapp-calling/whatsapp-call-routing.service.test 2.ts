import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { WA_DEFAULT_GREETING, WhatsAppInboundRouter } from './whatsapp-call-routing.service';

/**
 * Inbound WhatsApp-call routing (WAC-04) against real Postgres + RLS. Dedicated tenants so the
 * number→agent resolution + PUBLISHED gate + tenant isolation are all provable.
 */
const db = new PrismaService();
const svc = new WhatsAppInboundRouter(db);
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff24a001';
const T2 = '00000000-0000-0000-0000-0000ff24a002';

const FALLBACK = '00000000-0000-0000-0000-0000ff24b001';
const ASSIGNED = '00000000-0000-0000-0000-0000ff24b002';
const DRAFT = '00000000-0000-0000-0000-0000ff24b003';
const FLOW = '00000000-0000-0000-0000-0000ff24c001';
const FLOW_VERSION = '00000000-0000-0000-0000-0000ff24c002';
const BIZ_NUMBER = '+16315553601';

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `wac4-${id.slice(-4)}`,
        slug: `wac4-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
  await db.admin.agent.createMany({
    data: [
      {
        id: FALLBACK,
        tenantId: T,
        name: 'Fallback Agent',
        status: 'PUBLISHED',
        persona: { role: 'a helpdesk agent' },
        createdAt: new Date('2020-01-01T00:00:00Z'),
      },
      {
        id: ASSIGNED,
        tenantId: T,
        name: 'Assigned Agent',
        status: 'PUBLISHED',
        persona: { systemPrompt: 'Custom A prompt.' },
        createdAt: new Date('2021-01-01T00:00:00Z'),
      },
      // A DRAFT agent in T2 proves the PUBLISHED gate (never routed to).
      { id: DRAFT, tenantId: T2, name: 'Draft Agent', status: 'DRAFT' },
    ],
  });
  await db.admin.phoneNumber.create({
    data: {
      tenantId: T,
      provider: 'TWILIO',
      e164: BIZ_NUMBER,
      assignedAgentId: ASSIGNED,
    },
  });
  await db.admin.flow.create({
    data: { id: FLOW, tenantId: T, agentId: ASSIGNED, name: 'Main', isActive: true },
  });
  await db.admin.flowVersion.create({
    data: {
      id: FLOW_VERSION,
      tenantId: T,
      flowId: FLOW,
      version: 1,
      publishedAt: new Date('2021-02-01T00:00:00Z'),
    },
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('WhatsAppInboundRouter.resolveInboundAgent', () => {
  it('routes to the number-assigned agent and resolves its active flow version + persona prompt', async () => {
    const r = await svc.resolveInboundAgent(T, '16315553601'); // Meta sends digits (no +)
    expect(r?.agentId).toBe(ASSIGNED);
    expect(r?.agentName).toBe('Assigned Agent');
    expect(r?.systemPrompt).toBe('Custom A prompt.');
    expect(r?.flowVersionId).toBe(FLOW_VERSION);
    expect(r?.greeting).toBe(WA_DEFAULT_GREETING);
  });

  it('falls back to the first PUBLISHED agent when the number is not mapped', async () => {
    const r = await svc.resolveInboundAgent(T, '19998887777');
    expect(r?.agentId).toBe(FALLBACK);
    expect(r?.systemPrompt).toBe('You are a helpdesk agent.');
    expect(r?.flowVersionId).toBeNull(); // fallback agent has no active flow
  });

  it('falls back when the business number is unknown/undefined', async () => {
    const r = await svc.resolveInboundAgent(T, undefined);
    expect(r?.agentId).toBe(FALLBACK);
  });

  it('returns null when the tenant has no PUBLISHED agent (only a DRAFT one)', async () => {
    const r = await svc.resolveInboundAgent(T2, '16315553601');
    expect(r).toBeNull();
  });

  it('is tenant-isolated — T2 never resolves to T’s assigned agent/number (self-audit B)', async () => {
    // Even though BIZ_NUMBER is assigned in T, T2 must not see it (RLS) → null (no published agent).
    const r = await svc.resolveInboundAgent(T2, '16315553601');
    expect(r).toBeNull();
  });
});
