import { z } from 'zod';
import {
  AUTOMATION_EVENTS,
  type AutomationEvent,
  type AutomationTrigger,
  matchesTrigger,
} from './automation.js';

/**
 * Visual workflow automation builder (Day 85) — the pure domain shared across api/web/workers.
 *
 * A workflow is a DAG of nodes: a single TRIGGER (an event, optionally filtered — reusing the Day-47
 * event catalogue) → CONDITION (branch true/false on a field test) / ACTION (webhook / notify / task)
 * / DELAY (wait, durably) → … → END. The execution engine (workers) walks the graph from the trigger,
 * evaluating conditions + running actions, checkpointing progress so it is durable + retryable; every
 * step is recorded for observability. Everything HERE is pure + deterministic — graph validation, the
 * condition evaluator, and the branch/next-node planner — so the engine's decisions unit-test without a
 * DB or a queue (self-audit A). Two properties matter most:
 *  - A (termination + durability): the graph is validated ACYCLIC and the engine is capped at
 *    {@link MAX_WORKFLOW_STEPS}, so a run always terminates; each node advance is a pure function of the
 *    graph + context, so a retry resumes deterministically from the last checkpoint.
 *  - C (action authz): actions are a closed, validated set; a webhook URL is SSRF-checked before it is
 *    ever called (in the worker), so a workflow can't be used to reach internal services.
 */

export const WORKFLOW_NODE_TYPES = ['TRIGGER', 'CONDITION', 'ACTION', 'DELAY', 'END'] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

/** Hard cap on nodes executed in one run — a belt-and-suspenders termination guard (self-audit A). */
export const MAX_WORKFLOW_STEPS = 100;
/** Hard cap on graph size (nodes) — keeps validation + execution bounded. */
export const MAX_WORKFLOW_NODES = 100;
/** Delay bounds (seconds): 1s … 24h. */
export const MIN_DELAY_SECONDS = 1;
export const MAX_DELAY_SECONDS = 86_400;

// ── Actions (a closed, worker-executable set — self-audit C) ───────────────────

/**
 * The actions a workflow can run. Deliberately a small, safe set the durable worker can execute with
 * only the admin DB client + the SSRF guard: `webhook` (integrate any external system — SSRF-checked),
 * `notify` (in-app), `task` (a task item). Native message/CRM/calendar actions plug into the same
 * injected executor interface later without touching the engine.
 */
export const WORKFLOW_ACTION_TYPES = ['webhook', 'notify', 'task'] as const;
export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export const workflowActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('webhook'),
    url: z.string().url().max(500),
    includeContext: z.boolean().default(true),
  }),
  z.object({ type: z.literal('notify'), message: z.string().min(1).max(500) }),
  z.object({ type: z.literal('task'), title: z.string().min(1).max(200) }),
]);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export function workflowActionLabel(action: WorkflowAction): string {
  switch (action.type) {
    case 'webhook':
      return 'POST webhook';
    case 'notify':
      return `Notify: ${action.message}`;
    case 'task':
      return `Create task: ${action.title}`;
  }
}

// ── Conditions (pure boolean tests — self-audit A) ─────────────────────────────

export const CONDITION_OPS = ['eq', 'ne', 'contains', 'exists', 'gt', 'lt'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export const conditionConfigSchema = z.object({
  field: z.string().min(1).max(60),
  op: z.enum(CONDITION_OPS),
  value: z.string().max(200).optional(),
});
export type ConditionConfig = z.infer<typeof conditionConfigSchema>;

/** The run context a condition evaluates against: the trigger event + any accumulated variables. */
export interface WorkflowContext {
  event: AutomationEvent;
  vars: Record<string, unknown>;
}

/** Flatten the context into a single field namespace: event fields first, vars override. */
function flatten(ctx: WorkflowContext): Record<string, unknown> {
  return { ...(ctx.event as unknown as Record<string, unknown>), ...ctx.vars };
}

/**
 * Evaluate a condition against the run context. Pure + total: an unknown field is `undefined`, so
 * `exists` is false and comparisons are false (never throws). Numeric ops coerce both sides to Number
 * and are false if either side is NaN.
 */
export function evalCondition(cfg: ConditionConfig, ctx: WorkflowContext): boolean {
  const actual = flatten(ctx)[cfg.field];
  const expected = cfg.value ?? '';
  switch (cfg.op) {
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    case 'eq':
      return String(actual ?? '') === expected;
    case 'ne':
      return String(actual ?? '') !== expected;
    case 'contains':
      return String(actual ?? '').includes(expected);
    case 'gt': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
    }
    case 'lt': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
    }
  }
}

// ── Graph schema ────────────────────────────────────────────────────────────────

export const workflowNodeSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(WORKFLOW_NODE_TYPES),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  data: z
    .object({
      label: z.string().max(120).optional(),
      config: z.record(z.string(), z.unknown()).default({}),
    })
    .default({ config: {} }),
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1),
  target: z.string().min(1),
  /** For a CONDITION node's two outgoing edges: 'true' | 'false'. */
  sourceHandle: z.string().max(20).nullish(),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).max(MAX_WORKFLOW_NODES).default([]),
  edges: z.array(workflowEdgeSchema).default([]),
});
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

// ── Per-node config parsing (the graph stores config loosely; parse when needed) ──

export const triggerConfigSchema = z.object({
  event: z.enum(AUTOMATION_EVENTS),
  filters: z
    .object({
      disposition: z.string().max(60).optional(),
      leadStatus: z.string().max(60).optional(),
      agentId: z.string().uuid().optional(),
    })
    .default({}),
});
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

export const delayConfigSchema = z.object({
  seconds: z.number().int().min(MIN_DELAY_SECONDS).max(MAX_DELAY_SECONDS),
});

export const actionConfigSchema = z.object({ action: workflowActionSchema });

export function nodeById(graph: WorkflowGraph, id: string): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function triggerNode(graph: WorkflowGraph): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.type === 'TRIGGER');
}

/** Parse a node's config to its typed shape, or null if it doesn't match (invalid config). */
export function nodeTrigger(node: WorkflowNode): TriggerConfig | null {
  const p = triggerConfigSchema.safeParse(node.data.config);
  return p.success ? p.data : null;
}
export function nodeCondition(node: WorkflowNode): ConditionConfig | null {
  const p = conditionConfigSchema.safeParse(node.data.config);
  return p.success ? p.data : null;
}
export function nodeDelaySeconds(node: WorkflowNode): number | null {
  const p = delayConfigSchema.safeParse(node.data.config);
  return p.success ? p.data.seconds : null;
}
export function nodeAction(node: WorkflowNode): WorkflowAction | null {
  const p = actionConfigSchema.safeParse(node.data.config);
  return p.success ? p.data.action : null;
}

// ── The next-node planner (pure — the engine's only branching logic) ───────────

/**
 * Given the node we just finished, decide the next node id (or null to end). For a CONDITION we
 * evaluate the test and follow the edge whose `sourceHandle` is 'true'/'false'; for any other node we
 * follow its single outgoing edge. Deterministic given the same graph + context (self-audit A).
 */
export function nextNodeId(
  graph: WorkflowGraph,
  fromNodeId: string,
  ctx: WorkflowContext,
): string | null {
  const node = nodeById(graph, fromNodeId);
  if (!node || node.type === 'END') return null;
  if (node.type === 'CONDITION') {
    const cfg = nodeCondition(node);
    const branch = cfg ? evalCondition(cfg, ctx) : false;
    const handle = branch ? 'true' : 'false';
    const edge = graph.edges.find((e) => e.source === fromNodeId && e.sourceHandle === handle);
    return edge?.target ?? null;
  }
  const edge = graph.edges.find((e) => e.source === fromNodeId);
  return edge?.target ?? null;
}

/** Does this workflow's trigger fire for the given event? (reuses the Day-47 matcher). */
export function triggerMatches(graph: WorkflowGraph, event: AutomationEvent): boolean {
  const t = triggerNode(graph);
  if (!t) return false;
  const cfg = nodeTrigger(t);
  if (!cfg) return false;
  const trigger: AutomationTrigger = { event: cfg.event, filters: cfg.filters };
  return matchesTrigger(trigger, event);
}

// ── Validation (structure + config + acyclicity — self-audit A) ────────────────

export interface WorkflowValidationError {
  code: string;
  message: string;
  nodeId?: string;
}

/**
 * Validate a workflow graph before it can be activated. Guarantees the engine can run it safely:
 * exactly one TRIGGER (with valid config + no incoming), no dangling edges, each CONDITION has BOTH a
 * true and a false branch (+ valid config), ACTION/DELAY have valid config + one outgoing edge, END has
 * no outgoing edge, and — critically for termination — the graph is ACYCLIC (self-audit A).
 */
export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));

  const triggers = graph.nodes.filter((n) => n.type === 'TRIGGER');
  if (triggers.length === 0)
    errors.push({ code: 'NO_TRIGGER', message: 'A workflow needs a trigger.' });
  if (triggers.length > 1)
    errors.push({ code: 'MULTIPLE_TRIGGERS', message: 'A workflow can have only one trigger.' });

  // Dangling edges (source/target must resolve to a node).
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target))
      errors.push({ code: 'DANGLING_EDGE', message: `Edge ${e.id} points at a missing node.` });
  }

  const outgoing = (id: string) => graph.edges.filter((e) => e.source === id);
  const incoming = (id: string) => graph.edges.filter((e) => e.target === id);

  for (const n of graph.nodes) {
    const out = outgoing(n.id);
    switch (n.type) {
      case 'TRIGGER': {
        if (!nodeTrigger(n))
          errors.push({ code: 'BAD_TRIGGER', message: 'Trigger config is invalid.', nodeId: n.id });
        if (incoming(n.id).length > 0)
          errors.push({
            code: 'TRIGGER_INCOMING',
            message: 'A trigger cannot have an incoming edge.',
            nodeId: n.id,
          });
        // Exactly one outgoing edge — the engine follows a single successor (no fork node exists), so a
        // fan-out would silently drop branches (self-audit A).
        if (out.length !== 1)
          errors.push({
            code: 'TRIGGER_EDGES',
            message: 'The trigger must have exactly one next step.',
            nodeId: n.id,
          });
        break;
      }
      case 'CONDITION': {
        if (!nodeCondition(n))
          errors.push({
            code: 'BAD_CONDITION',
            message: 'Condition config is invalid.',
            nodeId: n.id,
          });
        // Exactly one 'true' + one 'false' outgoing edge and nothing else — otherwise the engine's
        // branch pick (first matching handle) would be ambiguous (self-audit A).
        const trues = out.filter((e) => e.sourceHandle === 'true').length;
        const falses = out.filter((e) => e.sourceHandle === 'false').length;
        const others = out.length - trues - falses;
        if (trues !== 1 || falses !== 1 || others > 0)
          errors.push({
            code: 'CONDITION_BRANCHES',
            message: 'A condition needs exactly one true and one false branch.',
            nodeId: n.id,
          });
        break;
      }
      case 'ACTION': {
        if (!nodeAction(n))
          errors.push({ code: 'BAD_ACTION', message: 'Action config is invalid.', nodeId: n.id });
        if (out.length !== 1)
          errors.push({
            code: 'ACTION_EDGES',
            message: 'An action must have exactly one next step.',
            nodeId: n.id,
          });
        break;
      }
      case 'DELAY': {
        if (nodeDelaySeconds(n) === null)
          errors.push({ code: 'BAD_DELAY', message: 'Delay config is invalid.', nodeId: n.id });
        if (out.length !== 1)
          errors.push({
            code: 'DELAY_EDGES',
            message: 'A delay must have exactly one next step.',
            nodeId: n.id,
          });
        break;
      }
      case 'END': {
        if (out.length > 0)
          errors.push({
            code: 'END_OUTGOING',
            message: 'An end node cannot have an outgoing edge.',
            nodeId: n.id,
          });
        break;
      }
    }
  }

  if (hasCycle(graph)) errors.push({ code: 'CYCLE', message: 'A workflow cannot contain a loop.' });

  return errors;
}

/** DFS cycle detection over the directed graph (self-audit A — guarantees termination). */
function hasCycle(graph: WorkflowGraph): boolean {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) adj.get(e.source)?.push(e.target);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(graph.nodes.map((n) => [n.id, WHITE]));
  const stack: { id: string; i: number }[] = [];
  for (const start of graph.nodes) {
    if (color.get(start.id) !== WHITE) continue;
    stack.push({ id: start.id, i: 0 });
    color.set(start.id, GRAY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      const neighbours = adj.get(frame.id) ?? [];
      if (frame.i < neighbours.length) {
        const next = neighbours[frame.i];
        frame.i += 1;
        if (next === undefined) continue;
        const c = color.get(next);
        if (c === GRAY) return true; // back-edge → cycle
        if (c === WHITE) {
          color.set(next, GRAY);
          stack.push({ id: next, i: 0 });
        }
      } else {
        color.set(frame.id, BLACK);
        stack.pop();
      }
    }
  }
  return false;
}
