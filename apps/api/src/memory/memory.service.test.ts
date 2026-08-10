import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MemoryService } from './memory.service';

/**
 * Cross-call Agent Memory (Day 34), against real Postgres (RLS-scoped). Proves: memory is
 * opt-in (memoryEnabled), merges facts, is tenant+contact scoped, and is erasable (GDPR).
 */

const db = new PrismaService();
const svc = new MemoryService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const createdAgents: string[] = [];
const createdContacts: string[] = [];

async function agent(tenantId: string, memoryEnabled: boolean): Promise<string> {
  const a = await db.admin.agent.create({
    data: { tenantId, name: 'Memory Agent', memoryEnabled },
    select: { id: true },
  });
  createdAgents.push(a.id);
  return a.id;
}
async function contact(tenantId: string): Promise<string> {
  const c = await db.admin.contact.create({
    data: { tenantId, phone: `+1415550${Math.floor(1000 + Math.random() * 8999)}` },
    select: { id: true },
  });
  createdContacts.push(c.id);
  return c.id;
}

afterAll(async () => {
  await db.admin.contact.deleteMany({ where: { id: { in: createdContacts } } });
  await db.admin.agent.deleteMany({ where: { id: { in: createdAgents } } });
});

describe('MemoryService', () => {
  it('writes (opt-in), merges facts, reads back, and lists per contact', async () => {
    const agentId = await agent(C1, true);
    const contactId = await contact(C1);

    const first = await svc.upsert(C1, agentId, contactId, {
      summary: 'Prefers mornings.',
      facts: [{ key: 'budget', value: '$500', kind: 'budget' }],
    });
    expect(first?.summary).toBe('Prefers mornings.');

    // Second upsert merges: budget overwritten, new fact added.
    const merged = await svc.upsert(C1, agentId, contactId, {
      summary: 'Prefers mornings; ready to buy.',
      facts: [
        { key: 'budget', value: '$800', kind: 'budget' },
        { key: 'pet', value: 'dog', kind: 'detail' },
      ],
    });
    expect(merged?.facts.find((f) => f.key.toLowerCase() === 'budget')?.value).toBe('$800');
    expect(merged?.facts.some((f) => f.key === 'pet')).toBe(true);

    const list = await svc.getForContact(C1, contactId);
    expect(list).toHaveLength(1);
    expect(list[0]?.agentId).toBe(agentId);
  });

  it('is a no-op when the agent has memory disabled (opt-in)', async () => {
    const agentId = await agent(C1, false);
    const contactId = await contact(C1);
    const res = await svc.upsert(C1, agentId, contactId, {
      summary: 'x',
      facts: [{ key: 'k', value: 'v', kind: 'detail' }],
    });
    expect(res).toBeNull();
    expect(await svc.getForContact(C1, contactId)).toEqual([]);
  });

  it('erases a contact’s memory (GDPR) and is tenant-scoped (RLS)', async () => {
    const agentId = await agent(C1, true);
    const contactId = await contact(C1);
    await svc.upsert(C1, agentId, contactId, { summary: 's', facts: [] });
    expect(await svc.getForContact(C1, contactId)).toHaveLength(1);

    const erased = await svc.eraseContact(C1, contactId);
    expect(erased.erased).toBe(1);
    expect(await svc.getForContact(C1, contactId)).toEqual([]);

    // RLS: a child tenant (C1) cannot see its parent reseller's (R1) memory. (R1→C1 is a
    // reseller subtree, so R1 legitimately sees C1 — isolation is the child-can't-see-parent
    // direction.)
    const r1Agent = await agent(R1, true);
    const r1Contact = await contact(R1);
    await svc.upsert(R1, r1Agent, r1Contact, { summary: 'r1', facts: [] });
    expect(await svc.getForContact(C1, r1Contact)).toEqual([]); // hidden from the child tenant
  });
});
