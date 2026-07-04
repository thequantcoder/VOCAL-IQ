import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ChatService } from './chat.service';

/**
 * Multimodal chat (Day 45) against real Postgres (RLS). Proves: the SAME published agent flow
 * drives voice, chat, and whatsapp to the SAME outcome (consistency, self-audit A); text
 * channels strip SSML; a run needs a published flow; and it's tenant-scoped (self-audit B).
 */

const db = new PrismaService();
const svc = new ChatService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const createdAgents: string[] = [];
const createdFlows: string[] = [];

// START(SSML opening) → LISTEN(capture reason) → DECISION(intent) → {booked | bye}.
const GRAPH = {
  nodes: [
    {
      id: 'start',
      type: 'START',
      position: { x: 0, y: 0 },
      data: { config: { openingLine: 'Hi,<break/> how can I help?' } },
    },
    {
      id: 'listen',
      type: 'LISTEN',
      position: { x: 0, y: 100 },
      data: { config: { captures: [{ name: 'reason', type: 'text' }] } },
    },
    { id: 'decide', type: 'DECISION', position: { x: 0, y: 200 }, data: { config: {} } },
    {
      id: 'booked',
      type: 'END',
      position: { x: 0, y: 300 },
      data: { config: { outcome: 'booked' } },
    },
    {
      id: 'bye',
      type: 'END',
      position: { x: 100, y: 300 },
      data: { config: { outcome: 'no_booking' } },
    },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'listen' },
    { id: 'e2', source: 'listen', target: 'decide' },
    {
      id: 'e3',
      source: 'decide',
      target: 'booked',
      data: { kind: 'intent', expression: 'booking' },
    },
    { id: 'e4', source: 'decide', target: 'bye', data: { kind: 'else' } },
  ],
};

async function publishedAgent(tenantId: string): Promise<string> {
  const agent = await db.admin.agent.create({
    data: { tenantId, name: 'Multi Agent' },
    select: { id: true },
  });
  createdAgents.push(agent.id);
  const flow = await db.admin.flow.create({
    data: { tenantId, agentId: agent.id, name: 'main', isActive: true },
    select: { id: true },
  });
  createdFlows.push(flow.id);
  await db.admin.flowVersion.create({
    data: { tenantId, flowId: flow.id, version: 1, graph: GRAPH, publishedAt: new Date() },
  });
  return agent.id;
}

afterAll(async () => {
  await db.admin.flow.deleteMany({ where: { id: { in: createdFlows } } });
  await db.admin.agent.deleteMany({ where: { id: { in: createdAgents } } });
});

describe('ChatService', () => {
  it('drives the same flow to the same outcome across voice / chat / whatsapp', async () => {
    const agentId = await publishedAgent(C1);
    const reply = { text: 'I want to book', intent: 'booking' };

    for (const channel of ['VOICE', 'CHAT', 'WHATSAPP'] as const) {
      const opened = await svc.start(C1, agentId, channel);
      expect(opened.awaitingInput).toBe(true);
      const turned = await svc.turn(C1, agentId, opened.state, reply.text, reply.intent);
      expect(turned.done).toBe(true);
      expect(turned.outcome).toBe('booked'); // identical routing on every channel
      expect(turned.state.captured.reason).toBe('I want to book');
    }
  });

  it('renders channel-appropriately (voice keeps SSML, chat strips it)', async () => {
    const agentId = await publishedAgent(C1);
    const voice = await svc.start(C1, agentId, 'VOICE');
    const chat = await svc.start(C1, agentId, 'CHAT');
    expect(voice.messages[0]?.text).toContain('<break');
    expect(chat.messages[0]?.text).not.toContain('<break');
  });

  it('requires a published flow', async () => {
    const bare = await db.admin.agent.create({
      data: { tenantId: C1, name: 'No Flow' },
      select: { id: true },
    });
    createdAgents.push(bare.id);
    await expect(svc.start(C1, bare.id, 'CHAT')).rejects.toThrow(/published flow/);
  });

  it("a tenant cannot chat with another tenant's agent (self-audit B)", async () => {
    const parentAgent = await publishedAgent(R1); // owned by the parent R1
    // The child C1 cannot see R1's agent → NotFound.
    await expect(svc.start(C1, parentAgent, 'CHAT')).rejects.toThrow(/Agent not found/);
  });
});
