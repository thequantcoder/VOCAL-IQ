import type { PrismaClient } from '@vocaliq/db';
import {
  MAX_WORKFLOW_STEPS,
  type WorkflowAction,
  type WorkflowContext,
  type WorkflowGraph,
  checkPublicHttpUrl,
  evalCondition,
  nextNodeId,
  nodeAction,
  nodeById,
  nodeCondition,
  nodeDelaySeconds,
  triggerNode,
  workflowGraphSchema,
} from '@vocaliq/shared';

/**
 * Durable workflow execution engine (Day 85). Walks a validated workflow graph from a checkpoint,
 * evaluating conditions + running actions, until it hits a DELAY (re-enqueue for later), an END, or the
 * step cap. All branching is a pure function of the graph + context (from @vocaliq/shared), so the
 * engine is deterministic + fully unit-testable via injected {@link WorkflowExecDeps}. Durability comes
 * from checkpointing `currentNodeId` after every node: a retry (BullMQ) or a delayed resume picks up
 * from the last checkpoint (at-least-once — actions should tolerate a retry; the webhook/notify/task
 * set is safe to repeat). Observability comes from a {@link recordStep} per node (self-audit A + F).
 */

export interface LoadedRun {
  tenantId: string;
  workflowId: string;
  status: string;
  graph: WorkflowGraph;
  context: WorkflowContext;
  currentNodeId: string | null;
  stepCount: number;
}

export type ActionOutcome = { status: 'ok' | 'skipped' | 'error'; detail?: string };

export interface StepRecord {
  nodeId: string;
  nodeType: string;
  status: 'ok' | 'skipped' | 'error' | 'branched' | 'waiting';
  detail?: string;
}

export interface WorkflowExecDeps {
  loadRun(runId: string): Promise<LoadedRun | null>;
  executeAction(
    tenantId: string,
    action: WorkflowAction,
    ctx: WorkflowContext,
  ): Promise<ActionOutcome>;
  recordStep(runId: string, tenantId: string, step: StepRecord): Promise<void>;
  /** Checkpoint the resume node + step count after advancing (durability). */
  saveProgress(runId: string, currentNodeId: string | null, stepCount: number): Promise<void>;
  /** Park the run at a resume node and re-enqueue it after `delayMs` (a DELAY node). */
  markWaiting(runId: string, resumeNodeId: string | null, stepCount: number): Promise<void>;
  scheduleResume(runId: string, delayMs: number): Promise<void>;
  markCompleted(runId: string, stepCount: number): Promise<void>;
  markFailed(runId: string, error: string): Promise<void>;
  log(message: string): void;
}

export type WorkflowExecResult =
  | { status: 'not_found' }
  | { status: 'skipped'; reason: string }
  | { status: 'completed'; steps: number }
  | { status: 'waiting'; steps: number }
  | { status: 'failed'; reason: string };

/**
 * Execute (or resume) one workflow run. Returns when the run completes, parks on a DELAY, or fails. A
 * run already terminal (completed/failed) is a no-op (idempotent re-delivery). A run that has never
 * advanced starts at the trigger; otherwise it resumes at the checkpointed `currentNodeId`.
 */
export async function runWorkflowExecution(
  deps: WorkflowExecDeps,
  { runId }: { runId: string },
): Promise<WorkflowExecResult> {
  const run = await deps.loadRun(runId);
  if (!run) return { status: 'not_found' };
  if (run.status === 'completed' || run.status === 'failed')
    return { status: 'skipped', reason: run.status };

  const { tenantId, graph, context } = run;

  // Starting node: resume at the checkpoint, or (first run) enter at the trigger's next node.
  let current: string | null;
  if (run.currentNodeId) {
    current = run.currentNodeId;
  } else {
    const trigger = triggerNode(graph);
    if (!trigger) {
      await deps.markFailed(runId, 'Workflow has no trigger node.');
      return { status: 'failed', reason: 'no_trigger' };
    }
    await deps.recordStep(runId, tenantId, {
      nodeId: trigger.id,
      nodeType: 'TRIGGER',
      status: 'ok',
    });
    current = nextNodeId(graph, trigger.id, context);
    // Checkpoint the trigger→first-node transition immediately, so a crash while processing the first
    // node doesn't re-record the trigger or re-run the first node on retry (self-audit A). No node has
    // been counted yet, so the step count is unchanged.
    await deps.saveProgress(runId, current, run.stepCount);
  }

  let steps = run.stepCount;
  while (current) {
    if (steps >= MAX_WORKFLOW_STEPS) {
      await deps.markFailed(runId, `Exceeded the ${MAX_WORKFLOW_STEPS}-step limit.`);
      return { status: 'failed', reason: 'step_limit' };
    }
    const node = nodeById(graph, current);
    if (!node) {
      await deps.markFailed(runId, `Missing node "${current}".`);
      return { status: 'failed', reason: 'missing_node' };
    }
    steps += 1;

    if (node.type === 'END') {
      await deps.recordStep(runId, tenantId, { nodeId: node.id, nodeType: 'END', status: 'ok' });
      await deps.markCompleted(runId, steps);
      return { status: 'completed', steps };
    }

    if (node.type === 'ACTION') {
      const action = nodeAction(node);
      if (!action) {
        await deps.recordStep(runId, tenantId, {
          nodeId: node.id,
          nodeType: 'ACTION',
          status: 'error',
          detail: 'invalid action config',
        });
      } else {
        // Best-effort: a failing action is recorded and the run continues (a broken webhook shouldn't
        // strand the whole workflow — self-audit A). executeAction never throws (it catches internally).
        const outcome = await deps.executeAction(tenantId, action, context);
        await deps.recordStep(runId, tenantId, {
          nodeId: node.id,
          nodeType: 'ACTION',
          status: outcome.status,
          ...(outcome.detail ? { detail: outcome.detail } : {}),
        });
      }
    } else if (node.type === 'CONDITION') {
      const cfg = nodeCondition(node);
      const branch = cfg ? evalCondition(cfg, context) : false;
      await deps.recordStep(runId, tenantId, {
        nodeId: node.id,
        nodeType: 'CONDITION',
        status: 'branched',
        detail: branch ? 'true' : 'false',
      });
    } else if (node.type === 'DELAY') {
      const seconds = nodeDelaySeconds(node) ?? 0;
      const resume = nextNodeId(graph, node.id, context);
      await deps.recordStep(runId, tenantId, {
        nodeId: node.id,
        nodeType: 'DELAY',
        status: 'waiting',
        detail: `${seconds}s`,
      });
      await deps.markWaiting(runId, resume, steps);
      await deps.scheduleResume(runId, seconds * 1000);
      return { status: 'waiting', steps };
    }

    // Advance + checkpoint (a retry/crash resumes from here).
    current = nextNodeId(graph, node.id, context);
    await deps.saveProgress(runId, current, steps);
  }

  // Ran off the end of the graph (a terminal node with no outgoing edge) → complete.
  await deps.markCompleted(runId, steps);
  return { status: 'completed', steps };
}

// ── Production wiring (admin Prisma client — the worker spans tenants) ──────────

const HTTP_TIMEOUT_MS = 8_000;

/**
 * The built-in action executor. `webhook` POSTs to an SSRF-checked URL (self-audit C); `notify`/`task`
 * write a Notification row in the run's tenant. Native message/CRM/calendar actions can be added here
 * (injecting the messaging/integration subsystems) without touching the engine.
 */
async function executeActionDb(
  admin: PrismaClient,
  tenantId: string,
  action: WorkflowAction,
  ctx: WorkflowContext,
): Promise<ActionOutcome> {
  try {
    if (action.type === 'webhook') {
      const check = checkPublicHttpUrl(action.url);
      if (!check.ok) return { status: 'error', detail: `blocked URL: ${check.reason}` };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
      try {
        const res = await fetch(action.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            action.includeContext
              ? { event: ctx.event, vars: ctx.vars }
              : { event: ctx.event.event },
          ),
          signal: controller.signal,
          // Do NOT follow redirects — a 3xx to an internal host would bypass the SSRF guard, which only
          // vetted the initial URL (self-audit C).
          redirect: 'manual',
        });
        if (res.status >= 300 && res.status < 400)
          return { status: 'error', detail: 'webhook redirect blocked (SSRF)' };
        return res.ok
          ? { status: 'ok', detail: String(res.status) }
          : { status: 'error', detail: `webhook ${res.status}` };
      } finally {
        clearTimeout(timer);
      }
    }
    if (action.type === 'notify') {
      await admin.notification.create({
        data: {
          tenantId,
          channel: 'inapp',
          payload: { message: action.message, callId: ctx.event.callId ?? null } as object,
        },
      });
      return { status: 'ok' };
    }
    // task
    await admin.notification.create({
      data: {
        tenantId,
        channel: 'task',
        payload: { title: action.title, callId: ctx.event.callId ?? null } as object,
      },
    });
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', detail: (err as Error).message };
  }
}

/** Build the production Deps. `enqueue` re-adds a run to the workflow queue after an optional delay. */
export function createDbWorkflowExecDeps(
  admin: PrismaClient,
  enqueue: (runId: string, delayMs: number) => Promise<void>,
  log: (msg: string) => void,
): WorkflowExecDeps {
  return {
    loadRun: async (runId) => {
      const run = await admin.workflowRun.findUnique({
        where: { id: runId },
        select: {
          tenantId: true,
          workflowId: true,
          status: true,
          context: true,
          currentNodeId: true,
          stepCount: true,
          workflow: { select: { graph: true } },
        },
      });
      if (!run) return null;
      const graph = workflowGraphSchema.safeParse(run.workflow.graph);
      const ctxRaw = (run.context ?? {}) as { event?: unknown; vars?: unknown };
      return {
        tenantId: run.tenantId,
        workflowId: run.workflowId,
        status: run.status,
        graph: graph.success ? graph.data : { nodes: [], edges: [] },
        context: {
          event: (ctxRaw.event ?? { event: 'call_ended' }) as WorkflowContext['event'],
          vars: (ctxRaw.vars ?? {}) as Record<string, unknown>,
        },
        currentNodeId: run.currentNodeId,
        stepCount: run.stepCount,
      };
    },
    executeAction: (tenantId, action, ctx) => executeActionDb(admin, tenantId, action, ctx),
    recordStep: async (runId, tenantId, step) => {
      await admin.workflowRunStep.create({
        data: {
          tenantId,
          runId,
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          status: step.status,
          detail: step.detail ?? null,
        },
      });
    },
    saveProgress: async (runId, currentNodeId, stepCount) => {
      await admin.workflowRun.update({ where: { id: runId }, data: { currentNodeId, stepCount } });
    },
    markWaiting: async (runId, resumeNodeId, stepCount) => {
      await admin.workflowRun.update({
        where: { id: runId },
        data: { status: 'waiting', currentNodeId: resumeNodeId, stepCount },
      });
    },
    scheduleResume: (runId, delayMs) => enqueue(runId, delayMs),
    markCompleted: async (runId, stepCount) => {
      await admin.workflowRun.update({
        where: { id: runId },
        data: { status: 'completed', currentNodeId: null, stepCount, finishedAt: new Date() },
      });
    },
    markFailed: async (runId, error) => {
      await admin.workflowRun.update({
        where: { id: runId },
        data: { status: 'failed', error, finishedAt: new Date() },
      });
    },
    log,
  };
}
