import { isAppError, validateFlowGraph } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { FlowsService } from './flows.service';

/** Flow graph persistence round-trip (real Postgres, RLS-scoped) — Day 17. */

const db = new PrismaService();
const svc = new FlowsService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT = '00000000-0000-0000-0000-0000006a0001';

beforeAll(async () => {
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Flow Agent' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.flowVersion.deleteMany({ where: { flow: { agentId: AGENT } } });
  await db.admin.flow.deleteMany({ where: { agentId: AGENT } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
});

describe('FlowsService', () => {
  it('creates a draft flow + v1 with a single START node on first open', async () => {
    const draft = await svc.getOrCreateDraft(C1, AGENT);
    expect(draft.version).toBe(1);
    const graph = draft.graph as { nodes: { type: string }[] };
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.type).toBe('START');
  });

  it('autosaves a graph and round-trips it back', async () => {
    const graph = {
      nodes: [
        { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { config: {} } },
        { id: 'say', type: 'SAY', position: { x: 200, y: 0 }, data: { label: 'Hi', config: {} } },
        { id: 'end', type: 'END', position: { x: 400, y: 0 }, data: { config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'say' },
        { id: 'e2', source: 'say', target: 'end' },
      ],
    };
    const saved = await svc.saveGraph(C1, AGENT, graph);
    expect(saved.version).toBe(1);

    const draft = await svc.getOrCreateDraft(C1, AGENT);
    const restored = draft.graph as typeof graph;
    expect(restored.nodes).toHaveLength(3);
    expect(restored.edges).toHaveLength(2);
    expect(validateFlowGraph(restored as never).valid).toBe(true);
  });

  it('rejects a malformed graph', async () => {
    await expect(
      svc.saveGraph(C1, AGENT, { nodes: [{ id: 'x', type: 'NOPE' }] }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('404s an unknown agent', async () => {
    await expect(
      svc.getOrCreateDraft(C1, '00000000-0000-0000-0000-0000009f9999'),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'NOT_FOUND');
  });
});

describe('FlowsService.publishFlow', () => {
  it('compile-gates: rejects an unpublishable draft', async () => {
    // Save a dead-end graph (SAY with no outgoing edge, no END path).
    await svc.saveGraph(C1, AGENT, {
      nodes: [
        { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { config: {} } },
        { id: 'say', type: 'SAY', position: { x: 200, y: 0 }, data: { config: {} } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'say' }],
    });
    await expect(svc.publishFlow(C1, AGENT)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('publishes a valid draft, pins the version, and opens a fresh draft', async () => {
    await svc.saveGraph(C1, AGENT, {
      nodes: [
        { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { config: {} } },
        { id: 'end', type: 'END', position: { x: 200, y: 0 }, data: { config: {} } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'end' }],
    });
    const res = await svc.publishFlow(C1, AGENT);
    expect(res.publishedVersion).toBe(1);
    expect(res.nextDraftVersion).toBe(2);

    // The published version is pinned; the new draft is editable.
    const draft = await svc.getOrCreateDraft(C1, AGENT);
    expect(draft.version).toBe(2);
  });
});

describe('FlowsService versioning + rollback', () => {
  const VALID = {
    nodes: [
      { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { config: {} } },
      { id: 'end', type: 'END', position: { x: 200, y: 0 }, data: { config: {} } },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  };

  it('lists versions with a draft flag and rolls a prior version back into the draft', async () => {
    // Publish v1 (→ opens draft v2), then edit + publish v2 (→ draft v3).
    await svc.saveGraph(C1, AGENT, VALID);
    await svc.publishFlow(C1, AGENT);
    const edited = {
      ...VALID,
      nodes: [
        ...VALID.nodes,
        {
          id: 'say',
          type: 'SAY',
          position: { x: 100, y: 0 },
          data: { config: { mode: 'scripted', text: 'Hi' } },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'say' },
        { id: 'e2', source: 'say', target: 'end' },
      ],
    };
    await svc.saveGraph(C1, AGENT, edited);
    await svc.publishFlow(C1, AGENT);

    const versions = await svc.listVersions(C1, AGENT);
    expect(versions[0]?.isDraft).toBe(true); // newest is the working draft
    expect(versions.filter((v) => !v.isDraft).length).toBeGreaterThanOrEqual(2); // v1 + v2 published

    // Roll v1 (the simple START→END) back into the current draft.
    const res = await svc.restoreVersion(C1, AGENT, 1);
    expect(res.restoredFrom).toBe(1);
    const draft = await svc.getOrCreateDraft(C1, AGENT);
    expect((draft.graph as { nodes: unknown[] }).nodes).toHaveLength(2); // restored to v1's 2 nodes
  });

  it('404s an unknown version', async () => {
    await expect(svc.restoreVersion(C1, AGENT, 999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
