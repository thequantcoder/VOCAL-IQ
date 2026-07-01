import { FlowNodeType } from './enums';
import type { FlowGraph } from './flow-graph';
import { validateFlowGraph } from './flow-graph';
import { type CapturedVariable, compileNode } from './flow-node-config';

/**
 * Flow compiler (Day 22): a validated React Flow graph → a deterministic runtime spec the
 * voice loop executes. It normalises nodes + edges into a state machine, then proves the
 * conversation is runnable: reachable, no dead-ends, and — critically — an END is always
 * reachable so a call can terminate (self-audit A). Cycles are allowed (loops are valid);
 * a live-lock with no reachable END is rejected.
 */

export interface CompiledTransition {
  target: string;
  kind: 'always' | 'expression' | 'intent' | 'else';
  expression?: string;
}

export interface CompiledNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
  captures: CapturedVariable[];
  transitions: CompiledTransition[];
}

export interface CompiledFlow {
  entry: string;
  nodes: Record<string, CompiledNode>;
}

export type CompileErrorCode =
  | 'STRUCTURE'
  | 'NO_ENTRY'
  | 'DEAD_END'
  | 'UNREACHABLE'
  | 'NO_REACHABLE_END'
  | 'DECISION_NO_FALLBACK';

export interface CompileError {
  code: CompileErrorCode;
  message: string;
  nodeId?: string;
}

export interface CompileResult {
  ok: boolean;
  flow: CompiledFlow | null;
  errors: CompileError[];
}

export function compileFlow(graph: FlowGraph): CompileResult {
  const errors: CompileError[] = [];

  // 1) Structural validation feeds in first (duplicate ids, dangling edges, …).
  const structural = validateFlowGraph(graph);
  for (const e of structural.errors) {
    errors.push({
      code: 'STRUCTURE',
      message: e.message,
      ...(e.nodeId ? { nodeId: e.nodeId } : {}),
    });
  }

  const start = graph.nodes.find((n) => n.type === FlowNodeType.START);
  if (!start) {
    errors.push({ code: 'NO_ENTRY', message: 'No Start node' });
    return { ok: false, flow: null, errors };
  }

  // 2) Normalise nodes + transitions.
  const nodes: Record<string, CompiledNode> = {};
  for (const node of graph.nodes) {
    const spec = compileNode(node);
    const transitions: CompiledTransition[] = graph.edges
      .filter((e) => e.source === node.id)
      .map((e) => ({
        target: e.target,
        kind: e.condition?.kind ?? 'always',
        ...(e.condition?.expression ? { expression: e.condition.expression } : {}),
      }));
    nodes[node.id] = {
      id: node.id,
      type: node.type,
      config: spec.config,
      captures: spec.captures,
      transitions,
    };
  }

  // 3) Dead-ends: only END may have no outgoing transition.
  for (const node of Object.values(nodes)) {
    if (node.type !== FlowNodeType.END && node.transitions.length === 0) {
      errors.push({ code: 'DEAD_END', message: `"${node.id}" has no next step`, nodeId: node.id });
    }
    // A Decision that branches must have a fallback (else/always) so no input dead-ends.
    if (node.type === FlowNodeType.DECISION && node.transitions.length > 0) {
      const hasFallback = node.transitions.some((t) => t.kind === 'else' || t.kind === 'always');
      if (!hasFallback) {
        errors.push({
          code: 'DECISION_NO_FALLBACK',
          message: `Decision "${node.id}" needs an else/default branch`,
          nodeId: node.id,
        });
      }
    }
  }

  // 4) Reachability from entry + at least one END reachable (termination).
  const reachable = new Set<string>();
  const queue = [start.id];
  let reachesEnd = false;
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    const node = nodes[id];
    if (!node) continue;
    if (node.type === FlowNodeType.END) reachesEnd = true;
    for (const t of node.transitions) if (!reachable.has(t.target)) queue.push(t.target);
  }
  for (const node of Object.values(nodes)) {
    if (!reachable.has(node.id)) {
      errors.push({ code: 'UNREACHABLE', message: `"${node.id}" is unreachable`, nodeId: node.id });
    }
  }
  if (!reachesEnd) {
    errors.push({
      code: 'NO_REACHABLE_END',
      message: 'No End node is reachable — the call can’t terminate',
    });
  }

  const ok = errors.length === 0;
  return { ok, flow: ok ? { entry: start.id, nodes } : null, errors };
}

// ── Runtime executor (deterministic; the loop drives this) ─────────────────────

export interface RuntimeSignal {
  /** Detected intent for a Decision branch (kind 'intent'). */
  intent?: string;
  /** Captured variables so far (for expression branches — evaluated by the loop). */
  captured?: Record<string, unknown>;
  /** Result of an evaluated 'expression' branch (the loop computes truthiness). */
  matched?: (expression: string) => boolean;
}

/**
 * Pick the next node id from `current`, or null at an End / no-match. Deterministic: the
 * first matching transition wins; `else` matches only if no earlier branch did; `always`
 * always matches.
 */
export function nextNode(
  flow: CompiledFlow,
  current: string,
  signal: RuntimeSignal = {},
): string | null {
  const node = flow.nodes[current];
  if (!node || node.transitions.length === 0) return null;

  let elseTarget: string | null = null;
  for (const t of node.transitions) {
    if (t.kind === 'always') return t.target;
    if (t.kind === 'else') {
      elseTarget = elseTarget ?? t.target;
      continue;
    }
    if (t.kind === 'intent' && signal.intent && t.expression && signal.intent === t.expression) {
      return t.target;
    }
    if (t.kind === 'expression' && t.expression && signal.matched?.(t.expression)) {
      return t.target;
    }
  }
  return elseTarget;
}

/** Stateful runner the loop uses to track the active node + emit node-active transitions. */
export class FlowRunner {
  active: string;
  readonly history: string[];

  constructor(private readonly flow: CompiledFlow) {
    this.active = flow.entry;
    this.history = [flow.entry];
  }

  get activeNode(): CompiledNode | undefined {
    return this.flow.nodes[this.active];
  }

  get done(): boolean {
    return this.activeNode?.type === FlowNodeType.END;
  }

  /** Advance to the next node given a signal; returns the new active node id or null (ended). */
  advance(signal: RuntimeSignal = {}): string | null {
    const next = nextNode(this.flow, this.active, signal);
    if (next === null) return null;
    this.active = next;
    this.history.push(next);
    return next;
  }
}
