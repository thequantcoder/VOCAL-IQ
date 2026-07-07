import type { WorkflowAction, WorkflowGraph } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import {
  type LoadedRun,
  type StepRecord,
  type WorkflowExecDeps,
  runWorkflowExecution,
} from './workflow-execution';

/** TRIGGER → COND(disposition==BOOKED) → (true: ACTION notify → END) (false: DELAY 60s → END2). */
function graph(): WorkflowGraph {
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
      { id: 'd', type: 'DELAY', position: { x: 2, y: 1 }, data: { config: { seconds: 60 } } },
      { id: 'e1', type: 'END', position: { x: 3, y: 0 }, data: { config: {} } },
      { id: 'e2', type: 'END', position: { x: 3, y: 1 }, data: { config: {} } },
    ],
    edges: [
      { id: 't-c', source: 't', target: 'c' },
      { id: 'c-a', source: 'c', target: 'a', sourceHandle: 'true' },
      { id: 'c-d', source: 'c', target: 'd', sourceHandle: 'false' },
      { id: 'a-e1', source: 'a', target: 'e1' },
      { id: 'd-e2', source: 'd', target: 'e2' },
    ],
  };
}

interface Harness {
  deps: WorkflowExecDeps;
  steps: StepRecord[];
  actions: WorkflowAction[];
  state: { status: string; currentNodeId: string | null; stepCount: number; error?: string };
  scheduled: number[];
}

function harness(run: Partial<LoadedRun>, actionOutcome: 'ok' | 'error' = 'ok'): Harness {
  const steps: StepRecord[] = [];
  const actions: WorkflowAction[] = [];
  const scheduled: number[] = [];
  const state = {
    status: run.status ?? 'running',
    currentNodeId: run.currentNodeId ?? null,
    stepCount: run.stepCount ?? 0,
  } as Harness['state'];
  const loaded: LoadedRun = {
    tenantId: 't1',
    workflowId: 'wf1',
    status: state.status,
    graph: run.graph ?? graph(),
    context: run.context ?? { event: { event: 'call_ended', disposition: 'BOOKED' }, vars: {} },
    currentNodeId: state.currentNodeId,
    stepCount: state.stepCount,
  };
  const deps: WorkflowExecDeps = {
    loadRun: async () => loaded,
    executeAction: async (_t, action) => {
      actions.push(action);
      return actionOutcome === 'ok'
        ? { status: 'ok', detail: 'done' }
        : { status: 'error', detail: 'boom' };
    },
    recordStep: async (_r, _t, step) => {
      steps.push(step);
    },
    saveProgress: async (_r, currentNodeId, stepCount) => {
      state.currentNodeId = currentNodeId;
      state.stepCount = stepCount;
    },
    markWaiting: async (_r, resume, stepCount) => {
      state.status = 'waiting';
      state.currentNodeId = resume;
      state.stepCount = stepCount;
    },
    scheduleResume: async (_r, delayMs) => {
      scheduled.push(delayMs);
    },
    markCompleted: async (_r, stepCount) => {
      state.status = 'completed';
      state.stepCount = stepCount;
    },
    markFailed: async (_r, error) => {
      state.status = 'failed';
      state.error = error;
    },
    log: () => {},
  };
  return { deps, steps, actions, state, scheduled };
}

describe('runWorkflowExecution (self-audit A — durable, correct)', () => {
  it('runs the TRUE branch: condition → action → end, recording every step', async () => {
    const h = harness({
      context: { event: { event: 'call_ended', disposition: 'BOOKED' }, vars: {} },
    });
    const res = await runWorkflowExecution(h.deps, { runId: 'r1' });
    expect(res.status).toBe('completed');
    expect(h.actions).toHaveLength(1); // the notify action ran
    expect(h.state.status).toBe('completed');
    expect(h.steps.map((s) => s.nodeType)).toEqual(['TRIGGER', 'CONDITION', 'ACTION', 'END']);
    expect(h.steps.find((s) => s.nodeType === 'CONDITION')?.detail).toBe('true');
  });

  it('runs the FALSE branch: condition → DELAY parks the run + schedules a resume', async () => {
    const h = harness({
      context: { event: { event: 'call_ended', disposition: 'NO_ANSWER' }, vars: {} },
    });
    const res = await runWorkflowExecution(h.deps, { runId: 'r1' });
    expect(res.status).toBe('waiting');
    expect(h.actions).toHaveLength(0); // never reached the action
    expect(h.state.status).toBe('waiting');
    expect(h.state.currentNodeId).toBe('e2'); // parked at the node AFTER the delay
    expect(h.scheduled).toEqual([60_000]); // 60s re-enqueue
  });

  it('resumes from a checkpoint (currentNodeId set) and completes', async () => {
    // Simulate the delayed resume: the run is parked at e2 (the END after the delay).
    const h = harness({
      status: 'waiting',
      currentNodeId: 'e2',
      stepCount: 3,
      context: { event: { event: 'call_ended', disposition: 'NO_ANSWER' }, vars: {} },
    });
    const res = await runWorkflowExecution(h.deps, { runId: 'r1' });
    expect(res.status).toBe('completed');
    // Resumed straight into the END — no trigger step re-recorded.
    expect(h.steps.map((s) => s.nodeType)).toEqual(['END']);
  });

  it('records an action error but continues (best-effort — self-audit A)', async () => {
    const h = harness(
      { context: { event: { event: 'call_ended', disposition: 'BOOKED' }, vars: {} } },
      'error',
    );
    const res = await runWorkflowExecution(h.deps, { runId: 'r1' });
    expect(res.status).toBe('completed'); // the run still finished
    expect(h.steps.find((s) => s.nodeType === 'ACTION')?.status).toBe('error');
  });

  it('is a no-op for an already-completed run (idempotent re-delivery)', async () => {
    const h = harness({ status: 'completed' });
    const res = await runWorkflowExecution(h.deps, { runId: 'r1' });
    expect(res).toEqual({ status: 'skipped', reason: 'completed' });
    expect(h.steps).toHaveLength(0);
  });

  it('returns not_found when the run is gone', async () => {
    const deps = { loadRun: async () => null } as unknown as WorkflowExecDeps;
    expect(await runWorkflowExecution(deps, { runId: 'nope' })).toEqual({ status: 'not_found' });
  });

  it('fails safe when the step cap is exceeded (termination guard — self-audit A)', async () => {
    // A pathological run that starts already at the cap resolves to a failure, not an infinite loop.
    const h = harness({
      stepCount: 100,
      currentNodeId: 'c',
      context: { event: { event: 'call_ended', disposition: 'BOOKED' }, vars: {} },
    });
    const res = await runWorkflowExecution(h.deps, { runId: 'r1' });
    expect(res).toEqual({ status: 'failed', reason: 'step_limit' });
    expect(h.state.status).toBe('failed');
  });
});
