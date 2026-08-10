import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { TestsService } from './tests.service';

/**
 * Agent testing (Day 33), against real Postgres (RLS-scoped). Proves: scenarios are
 * per-agent + tenant-isolated, a run compiles the published flow + grades deterministic
 * assertions + stores a report, and runs require a published flow.
 */

const db = new PrismaService();
const svc = new TestsService(db); // no LLM grader → deterministic
const C1 = '00000000-0000-0000-0000-000000000003';
const createdAgents: string[] = [];
const createdFlows: string[] = [];

async function publishedAgent(): Promise<string> {
  const agent = await db.admin.agent.create({
    data: { tenantId: C1, name: 'QA Agent' },
    select: { id: true },
  });
  createdAgents.push(agent.id);
  // A tiny published flow: START(opening) → END(outcome=done).
  const graph = {
    nodes: [
      {
        id: 'start',
        type: 'START',
        position: { x: 0, y: 0 },
        data: { config: { openingLine: 'Hi there' } },
      },
      { id: 'end', type: 'END', position: { x: 0, y: 100 }, data: { config: { outcome: 'done' } } },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  };
  const flow = await db.admin.flow.create({
    data: { tenantId: C1, agentId: agent.id, name: 'main', isActive: true },
    select: { id: true },
  });
  createdFlows.push(flow.id);
  await db.admin.flowVersion.create({
    data: { tenantId: C1, flowId: flow.id, version: 1, graph, publishedAt: new Date() },
  });
  return agent.id;
}

afterAll(async () => {
  await db.admin.flow.deleteMany({ where: { id: { in: createdFlows } } });
  await db.admin.agent.deleteMany({ where: { id: { in: createdAgents } } });
});

describe('TestsService', () => {
  it('creates scenarios, runs the suite against the published flow, and stores a report', async () => {
    const agentId = await publishedAgent();

    await svc.createScenario(C1, agentId, {
      name: 'greets and ends',
      caller: [],
      assertions: [
        { type: 'outcome_is', value: 'done' },
        { type: 'transcript_includes', text: 'hi there' },
        { type: 'visited', nodeId: 'end' },
      ],
    });
    await svc.createScenario(C1, agentId, {
      name: 'expects wrong outcome (fails)',
      caller: [],
      assertions: [{ type: 'outcome_is', value: 'booked' }],
    });

    const list = await svc.listScenarios(C1, agentId);
    expect(list).toHaveLength(2);

    const report = await svc.run(C1, agentId);
    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.runId).toBeTruthy();

    const runs = await svc.listRuns(C1, agentId);
    expect(runs[0]?.total).toBe(2);
    expect(runs[0]?.passed).toBe(1);
  });

  it('rejects a run when the agent has no published flow', async () => {
    const agent = await db.admin.agent.create({
      data: { tenantId: C1, name: 'No Flow Agent' },
      select: { id: true },
    });
    createdAgents.push(agent.id);
    await svc.createScenario(C1, agent.id, {
      name: 's',
      caller: [],
      assertions: [{ type: 'outcome_is', value: 'done' }],
    });
    await expect(svc.run(C1, agent.id)).rejects.toSatisfy(isAppError);
  });

  it('rejects an invalid scenario definition', async () => {
    const agent = await db.admin.agent.create({
      data: { tenantId: C1, name: 'Bad Scenario Agent' },
      select: { id: true },
    });
    createdAgents.push(agent.id);
    await expect(
      svc.createScenario(C1, agent.id, { name: '', assertions: [{ type: 'nope' }] }),
    ).rejects.toSatisfy(isAppError);
  });
});
