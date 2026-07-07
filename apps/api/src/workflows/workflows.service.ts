import {
  type AutomationEvent,
  NotFoundError,
  ValidationError,
  type WorkflowGraph,
  nodeTrigger,
  triggerMatches,
  triggerNode,
  validateWorkflowGraph,
  workflowGraphSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { WorkflowQueue } from './workflow-queue';

/**
 * Visual workflow automation (Day 85). CRUD over tenant-scoped workflows (a validated acyclic graph of
 * trigger/condition/action/delay/end nodes), plus the durable-run surface: `trigger`/`dispatchEvent`
 * create a {@link WorkflowRun} and enqueue it for the worker to execute, and `runsFor`/`stepsFor` expose
 * the run history + per-step logs for observability. Guarantees:
 *  - A (safe to run): a workflow can only be ACTIVATED when its graph is valid + acyclic
 *    ({@link validateWorkflowGraph}); only active workflows fire on an event.
 *  - B (isolation): everything is RLS-scoped by tenant (`db.withTenant`); no cross-tenant access.
 */

const WORKFLOW_SELECT = {
  id: true,
  name: true,
  status: true,
  triggerEvent: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

const RUN_SELECT = {
  id: true,
  workflowId: true,
  status: true,
  currentNodeId: true,
  stepCount: true,
  error: true,
  startedAt: true,
  finishedAt: true,
} as const;

const STEP_SELECT = {
  id: true,
  nodeId: true,
  nodeType: true,
  status: true,
  detail: true,
  attempt: true,
  createdAt: true,
} as const;

/** The runtime event that can fire workflows — mirrors the Day-47 automation event. */
export interface WorkflowDispatchEvent extends AutomationEvent {}

/** A workflow with its full graph (builder view). */
export interface WorkflowDetail {
  id: string;
  name: string;
  status: string;
  triggerEvent: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  graph: unknown;
}

export class WorkflowsService {
  constructor(
    private readonly db: PrismaService,
    private readonly queue: WorkflowQueue,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  /** Create a draft workflow with an empty graph. */
  async create(tenantId: string, name: string) {
    if (!name?.trim()) throw new ValidationError('A workflow name is required');
    return this.db.withTenant(tenantId, (tx) =>
      tx.workflow.create({
        data: { tenantId, name: name.trim(), status: 'draft' },
        select: WORKFLOW_SELECT,
      }),
    );
  }

  /** All of the tenant's workflows. */
  async list(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.workflow.findMany({ orderBy: { updatedAt: 'desc' }, select: WORKFLOW_SELECT }),
    );
  }

  /** One workflow with its full graph (for the builder). */
  async get(tenantId: string, id: string): Promise<WorkflowDetail> {
    const wf = await this.db.withTenant(tenantId, (tx) =>
      tx.workflow.findFirst({ where: { id }, select: { ...WORKFLOW_SELECT, graph: true } }),
    );
    if (!wf) throw new NotFoundError('Workflow not found');
    return wf;
  }

  /**
   * Save the graph (draft autosave — an invalid graph may be saved while editing; it just can't be
   * ACTIVATED). Denormalizes the trigger event so an incoming event can index candidate workflows.
   */
  async updateGraph(tenantId: string, id: string, graphInput: unknown) {
    const parsed = workflowGraphSchema.safeParse(graphInput);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid workflow graph');
    const graph = parsed.data;
    const t = triggerNode(graph);
    const triggerEvent = t ? (nodeTrigger(t)?.event ?? null) : null;

    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.workflow.findFirst({ where: { id }, select: { id: true, status: true } }),
    );
    if (!existing) throw new NotFoundError('Workflow not found');

    // Uphold the invariant "active ⇒ valid": if an ACTIVE workflow is edited into an invalid graph, it
    // is auto-downgraded to draft so the engine never runs an unvalidated graph (self-audit A).
    const invalidatesActive =
      existing.status === 'active' && validateWorkflowGraph(graph).length > 0;
    const status = invalidatesActive ? 'draft' : existing.status;

    return this.db.withTenant(tenantId, (tx) =>
      tx.workflow.update({
        where: { id },
        data: { graph: graph as object, triggerEvent, status },
        select: WORKFLOW_SELECT,
      }),
    );
  }

  /**
   * Change a workflow's status. Activating REQUIRES a valid, acyclic graph (self-audit A) — you can't
   * turn on a workflow the engine couldn't safely run. Pausing/redrafting is always allowed.
   */
  async setStatus(tenantId: string, id: string, status: 'active' | 'paused' | 'draft') {
    const wf = await this.db.withTenant(tenantId, (tx) =>
      tx.workflow.findFirst({ where: { id }, select: { graph: true } }),
    );
    if (!wf) throw new NotFoundError('Workflow not found');

    if (status === 'active') {
      const graph = this.parseGraph(wf.graph);
      const errors = validateWorkflowGraph(graph);
      if (errors.length > 0)
        throw new ValidationError(`Cannot activate: ${errors.map((e) => e.message).join(' ')}`);
    }
    return this.db.withTenant(tenantId, (tx) =>
      tx.workflow.update({ where: { id }, data: { status }, select: WORKFLOW_SELECT }),
    );
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.workflow.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Workflow not found');
    await this.db.withTenant(tenantId, (tx) => tx.workflow.delete({ where: { id } }));
    return { id };
  }

  // ── observability ─────────────────────────────────────────────────────────────

  /** Recent runs of a workflow (newest first). */
  async runsFor(tenantId: string, workflowId: string, limit = 50) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.workflowRun.findMany({
        where: { workflowId },
        orderBy: { startedAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
        select: RUN_SELECT,
      }),
    );
  }

  /** The per-step log of a single run (oldest first) — RLS-scoped, so a foreign run yields nothing. */
  async stepsFor(tenantId: string, runId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.workflowRunStep.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
        select: STEP_SELECT,
      }),
    );
  }

  // ── durable execution (create a run + enqueue) ─────────────────────────────────

  /** Manually fire a workflow with a test event (e.g. from the builder). The workflow must be active. */
  async trigger(tenantId: string, workflowId: string, event: WorkflowDispatchEvent) {
    const wf = await this.db.withTenant(tenantId, (tx) =>
      tx.workflow.findFirst({ where: { id: workflowId }, select: { status: true, graph: true } }),
    );
    if (!wf) throw new NotFoundError('Workflow not found');
    if (wf.status !== 'active')
      throw new ValidationError('Only an active workflow can be triggered.');
    const graph = this.parseGraph(wf.graph);
    if (!triggerMatches(graph, event))
      throw new ValidationError('This event does not match the workflow trigger.');
    return this.startRun(tenantId, workflowId, event);
  }

  /**
   * Fire every ACTIVE workflow whose trigger matches an event (the general dispatch path — e.g. called
   * on call-end). Uses the denormalized `triggerEvent` index to find candidates, then the pure matcher.
   */
  async dispatchEvent(tenantId: string, event: WorkflowDispatchEvent) {
    const candidates = await this.db.withTenant(tenantId, (tx) =>
      tx.workflow.findMany({
        where: { status: 'active', triggerEvent: event.event },
        select: { id: true, graph: true },
      }),
    );
    const runIds: string[] = [];
    for (const wf of candidates) {
      const graph = this.parseGraph(wf.graph);
      if (!triggerMatches(graph, event)) continue;
      const run = await this.startRun(tenantId, wf.id, event);
      runIds.push(run.id);
    }
    return { matched: runIds.length, runIds };
  }

  /** Create the run row (status running) + enqueue it for the worker. */
  private async startRun(tenantId: string, workflowId: string, event: WorkflowDispatchEvent) {
    const run = await this.db.withTenant(tenantId, (tx) =>
      tx.workflowRun.create({
        data: {
          tenantId,
          workflowId,
          status: 'running',
          context: { event, vars: {} } as object,
        },
        select: RUN_SELECT,
      }),
    );
    await this.queue.enqueue(run.id);
    return run;
  }

  private parseGraph(raw: unknown): WorkflowGraph {
    const parsed = workflowGraphSchema.safeParse(raw);
    // A stored graph should always parse; fall back to empty so callers never crash.
    return parsed.success ? parsed.data : { nodes: [], edges: [] };
  }
}
