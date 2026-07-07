import { type WorkflowGraph, isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { PendingWorkflowQueue } from './workflow-queue';
import { WorkflowsService } from './workflows.service';

/**
 * Workflow automation (Day 85) — real Postgres, RLS-scoped. Proves CRUD, activate-requires-valid-graph,
 * trigger + dispatch create a run + enqueue it, run/step observability, and cross-tenant isolation.
 */

const db = new PrismaService();
const queue = new PendingWorkflowQueue();
const svc = new WorkflowsService(db, queue);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T1 = '00000000-0000-0000-0000-0000085a0001';
const T2 = '00000000-0000-0000-0000-0000085a0002';

/** A valid TRIGGER(call_ended) → COND(disposition==BOOKED) → (true: notify → END) (false: END2). */
function validGraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: 't',
        type: 'TRIGGER',
        position: { x: 0, y: 0 },
        data: { config: { event: 'call_ended', filters: {} } },
      },
      {
        id: 'c',
        type: 'CONDITION',
        position: { x: 1, y: 0 },
        data: { config: { field: 'disposition', op: 'eq', value: 'BOOKED' } },
      },
      {
        id: 'a',
        type: 'ACTION',
        position: { x: 2, y: 0 },
        data: { config: { action: { type: 'notify', message: 'Booked!' } } },
      },
      { id: 'e1', type: 'END', position: { x: 3, y: 0 }, data: { config: {} } },
      { id: 'e2', type: 'END', position: { x: 2, y: 1 }, data: { config: {} } },
    ],
    edges: [
      { id: 't-c', source: 't', target: 'c' },
      { id: 'c-a', source: 'c', target: 'a', sourceHandle: 'true' },
      { id: 'c-e2', source: 'c', target: 'e2', sourceHandle: 'false' },
      { id: 'a-e1', source: 'a', target: 'e1' },
    ],
  };
}

beforeAll(async () => {
  for (const id of [T1, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Wf ${id.slice(-4)}`,
        slug: `wf-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
});

afterAll(async () => {
  await db.admin.workflowRunStep.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.workflowRun.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.workflow.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T1, T2] } } });
});

let wfId = '';

describe('Workflow CRUD + activation gate (self-audit A)', () => {
  it('creates a draft, saves a graph, and denormalizes the trigger event', async () => {
    const wf = await svc.create(T1, 'Post-call follow-up');
    wfId = wf.id;
    expect(wf.status).toBe('draft');
    const saved = await svc.updateGraph(T1, wfId, validGraph());
    expect(saved.triggerEvent).toBe('call_ended');
    const full = await svc.get(T1, wfId);
    expect((full.graph as WorkflowGraph).nodes).toHaveLength(5);
  });

  it('refuses to activate an INVALID graph, and activates a valid one', async () => {
    // Break the graph: drop the trigger.
    const broken = validGraph();
    broken.nodes = broken.nodes.filter((n) => n.type !== 'TRIGGER');
    await svc.updateGraph(T1, wfId, broken);
    await expect(svc.setStatus(T1, wfId, 'active')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
    // Restore the valid graph → activation succeeds.
    await svc.updateGraph(T1, wfId, validGraph());
    const active = await svc.setStatus(T1, wfId, 'active');
    expect(active.status).toBe('active');
  });

  it('auto-downgrades an ACTIVE workflow to draft if it is edited into an invalid graph (self-audit A)', async () => {
    expect((await svc.get(T1, wfId)).status).toBe('active');
    const broken = validGraph();
    broken.nodes = broken.nodes.filter((n) => n.type !== 'TRIGGER'); // now invalid
    const saved = await svc.updateGraph(T1, wfId, broken);
    expect(saved.status).toBe('draft'); // no longer active — the engine can't run an invalid graph
    // Restore + reactivate for the following tests.
    await svc.updateGraph(T1, wfId, validGraph());
    await svc.setStatus(T1, wfId, 'active');
  });
});

describe('Trigger + dispatch create a run + enqueue (self-audit A)', () => {
  it('trigger fires an active workflow, creating a run and enqueuing it', async () => {
    const before = queue.enqueued.length;
    const run = await svc.trigger(T1, wfId, { event: 'call_ended', disposition: 'BOOKED' });
    expect(run.status).toBe('running');
    expect(queue.enqueued).toContain(run.id);
    expect(queue.enqueued.length).toBe(before + 1);
  });

  it('trigger rejects an event that does not match the trigger', async () => {
    await expect(svc.trigger(T1, wfId, { event: 'lead_status_changed' })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('a non-active workflow cannot be triggered', async () => {
    await svc.setStatus(T1, wfId, 'paused');
    await expect(svc.trigger(T1, wfId, { event: 'call_ended' })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
    await svc.setStatus(T1, wfId, 'active'); // restore
  });

  it('dispatchEvent fires every matching active workflow', async () => {
    const res = await svc.dispatchEvent(T1, { event: 'call_ended', disposition: 'BOOKED' });
    expect(res.matched).toBeGreaterThanOrEqual(1);
    expect(res.runIds.length).toBe(res.matched);
    // A non-matching event fires nothing.
    const none = await svc.dispatchEvent(T1, { event: 'disposition_set' });
    expect(none.matched).toBe(0);
  });
});

describe('Observability — runs + steps (self-audit A)', () => {
  it('exposes run history and per-step logs', async () => {
    const runs = await svc.runsFor(T1, wfId);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const run = runs[0]!;
    // Simulate the worker recording a step (the run engine writes these).
    await db.admin.workflowRunStep.create({
      data: {
        tenantId: T1,
        runId: run.id,
        nodeId: 'a',
        nodeType: 'ACTION',
        status: 'ok',
        detail: 'notified',
      },
    });
    const steps = await svc.stepsFor(T1, run.id);
    expect(steps.some((s) => s.nodeId === 'a' && s.status === 'ok')).toBe(true);
  });
});

describe('Isolation (self-audit B)', () => {
  it('a tenant never sees another tenant’s workflows, runs, or steps', async () => {
    // T2 has no workflows.
    expect(await svc.list(T2)).toHaveLength(0);
    // T2 cannot fetch T1's workflow (RLS → NotFound).
    await expect(svc.get(T2, wfId)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
    // T2 sees no runs/steps for T1's workflow.
    expect(await svc.runsFor(T2, wfId)).toHaveLength(0);
    const t1Runs = await svc.runsFor(T1, wfId);
    expect(await svc.stepsFor(T2, t1Runs[0]!.id)).toHaveLength(0);
  });
});
