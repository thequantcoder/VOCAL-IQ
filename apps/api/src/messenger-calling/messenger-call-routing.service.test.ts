import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ME_DEFAULT_GREETING, MessengerInboundRouter } from './messenger-call-routing.service';

/**
 * MEC-04 inbound routing against real Postgres + RLS. Messenger has no phone numbers, so the router
 * answers with the tenant's first PUBLISHED agent (deterministic by creation).
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff31a001'; // has a published agent
const T2 = '00000000-0000-0000-0000-0000ff31a002'; // no published agent
const AGENT = '00000000-0000-0000-0000-0000ff31b001';

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `mec4-${id.slice(-4)}`,
        slug: `mec4-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'ME Agent', status: 'PUBLISHED' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('MessengerInboundRouter (MEC-04)', () => {
  it('resolves the tenant first PUBLISHED agent (Page id is not used for mapping)', async () => {
    const routing = await new MessengerInboundRouter(db).resolveInboundAgent(T, 'PAGE123');
    expect(routing?.agentId).toBe(AGENT);
    expect(routing?.greeting).toBe(ME_DEFAULT_GREETING);
    expect(typeof routing?.systemPrompt).toBe('string');
  });

  it('returns null when the tenant has no publishable agent', async () => {
    const routing = await new MessengerInboundRouter(db).resolveInboundAgent(T2);
    expect(routing).toBeNull();
  });

  it('is tenant-isolated — never resolves another tenant’s agent', async () => {
    // T2 has no agent of its own; T's agent must not leak across the RLS boundary.
    const routing = await new MessengerInboundRouter(db).resolveInboundAgent(T2, 'PAGE123');
    expect(routing).toBeNull();
  });
});
