import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { LeadsService } from './leads.service';

/**
 * Lead workspace (Day 29), against real Postgres (RLS-scoped). Proves: leads are created
 * from a tenant contact, auto-scoring sets score + temperature, pipeline moves are gated,
 * tags/dynamic vars persist, and leads are tenant-isolated.
 */

const db = new PrismaService();
const svc = new LeadsService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const createdLeads: string[] = [];
const createdContacts: string[] = [];

async function makeContact(tenantId: string, name: string): Promise<string> {
  const c = await db.admin.contact.create({
    data: { tenantId, name, phone: `+1415555${Math.floor(1000 + Math.random() * 8999)}` },
    select: { id: true },
  });
  createdContacts.push(c.id);
  return c.id;
}

afterAll(async () => {
  await db.admin.lead.deleteMany({ where: { id: { in: createdLeads } } });
  await db.admin.contact.deleteMany({ where: { id: { in: createdContacts } } });
});

describe('LeadsService', () => {
  it('creates a lead, auto-scores it, and moves it through the pipeline', async () => {
    const contactId = await makeContact(C1, 'Ada Lovelace');
    const lead = await svc.create(C1, { contactId });
    createdLeads.push(lead.id);
    expect(lead.pipelineStage).toBe('NEW');
    expect(lead.contactName).toBe('Ada Lovelace');

    // Creating again for the same contact returns the same lead (one per contact).
    const again = await svc.create(C1, { contactId });
    expect(again.id).toBe(lead.id);

    // Auto-scoring a hot call.
    const scored = await svc.applyScore(C1, lead.id, {
      intent: 'ready',
      sentiment: 'positive',
      outcome: 'booked',
      talkSeconds: 200,
    });
    expect(scored.status).toBe('HOT');
    expect(scored.score).toBeGreaterThanOrEqual(65);

    // Pipeline: NEW → QUALIFIED ok; QUALIFIED → NEW illegal.
    const qualified = await svc.moveStage(C1, lead.id, 'QUALIFIED');
    expect(qualified.pipelineStage).toBe('QUALIFIED');
    await expect(svc.moveStage(C1, lead.id, 'NEW')).rejects.toSatisfy(isAppError);
  });

  it('persists owner, tags, and dynamic vars', async () => {
    const contactId = await makeContact(C1, 'Grace Hopper');
    const lead = await svc.create(C1, { contactId });
    createdLeads.push(lead.id);

    const owner = '00000000-0000-0000-0000-00000000000a';
    const updated = await svc.update(C1, lead.id, {
      owner,
      tags: ['vip', 'inbound'],
      dynamicVars: { plan: 'Pro', renewal: '2026-08-01' },
    });
    expect(updated.owner).toBe(owner);
    expect(updated.tags).toEqual(['vip', 'inbound']);
    expect(updated.dynamicVars.plan).toBe('Pro');
  });

  it('rejects creating a lead from a foreign-tenant contact and isolates leads', async () => {
    const foreignContact = await makeContact(R1, 'Foreign');
    await expect(svc.create(C1, { contactId: foreignContact })).rejects.toSatisfy(isAppError);

    const r1Lead = await svc.create(R1, { contactId: foreignContact });
    createdLeads.push(r1Lead.id);
    await expect(svc.get(C1, r1Lead.id)).rejects.toSatisfy(isAppError); // RLS hides it
    const c1List = await svc.list(C1);
    expect(c1List.some((l) => l.id === r1Lead.id)).toBe(false);
  });
});
