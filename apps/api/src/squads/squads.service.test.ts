import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { SquadsService } from './squads.service';

/**
 * Squad CRUD (Day 27), against real Postgres (RLS-scoped). Proves: a squad chains the
 * tenant's own agents, handoff rules must reference members, foreign agents are rejected,
 * and squads are tenant-isolated (RLS hides another tenant's squad).
 */

const db = new PrismaService();
const svc = new SquadsService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002'; // a different tenant
const createdSquads: string[] = [];
const createdAgents: string[] = [];

async function makeAgent(tenantId: string, name: string): Promise<string> {
  const a = await db.admin.agent.create({ data: { tenantId, name }, select: { id: true } });
  createdAgents.push(a.id);
  return a.id;
}

afterAll(async () => {
  await db.admin.squad.deleteMany({ where: { id: { in: createdSquads } } });
  await db.admin.agent.deleteMany({ where: { id: { in: createdAgents } } });
});

describe('SquadsService', () => {
  it('creates a squad chaining the tenant agents with handoff rules', async () => {
    const reception = await makeAgent(C1, 'Reception');
    const booking = await makeAgent(C1, 'Booking');

    const squad = await svc.create(C1, {
      name: 'Front Office',
      entryAgentId: reception,
      members: [
        { agentId: reception, role: 'reception', order: 0 },
        { agentId: booking, role: 'booking', order: 1 },
      ],
      handoffRules: [{ fromAgentId: reception, on: 'booking', toAgentId: booking }],
    });
    createdSquads.push(squad.id);

    expect(squad.members).toHaveLength(2);
    expect(squad.entryAgentId).toBe(reception);
    expect(squad.handoffRules[0]?.toAgentId).toBe(booking);

    const list = await svc.list(C1);
    expect(list.find((s) => s.id === squad.id)?.memberCount).toBe(2);

    // Update replaces members + rules.
    const updated = await svc.update(C1, squad.id, {
      name: 'Front Office v2',
      members: [{ agentId: reception, role: 'reception', order: 0 }],
      handoffRules: [],
    });
    expect(updated.name).toBe('Front Office v2');
    expect(updated.members).toHaveLength(1);
  });

  it('rejects handoff rules that reference a non-member', async () => {
    const a = await makeAgent(C1, 'Solo');
    const b = await makeAgent(C1, 'Other');
    await expect(
      svc.create(C1, {
        name: 'Bad Rules',
        members: [{ agentId: a, role: 'reception', order: 0 }],
        handoffRules: [{ fromAgentId: a, on: 'x', toAgentId: b }], // b not a member
      }),
    ).rejects.toSatisfy(isAppError);
  });

  it('rejects enrolling an agent from another tenant', async () => {
    const foreign = await makeAgent(R1, 'Foreign Agent');
    await expect(
      svc.create(C1, {
        name: 'Cross Tenant',
        members: [{ agentId: foreign, role: 'reception', order: 0 }],
        handoffRules: [],
      }),
    ).rejects.toSatisfy(isAppError);
  });

  it('isolates squads by tenant (RLS)', async () => {
    const agent = await makeAgent(R1, 'R1 Agent');
    const squad = await svc.create(R1, {
      name: 'R1 Squad',
      members: [{ agentId: agent, role: 'reception', order: 0 }],
      handoffRules: [],
    });
    createdSquads.push(squad.id);

    // C1 cannot see R1's squad.
    await expect(svc.get(C1, squad.id)).rejects.toSatisfy(isAppError);
    const c1List = await svc.list(C1);
    expect(c1List.some((s) => s.id === squad.id)).toBe(false);
  });
});
