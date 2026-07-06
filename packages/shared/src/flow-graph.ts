import { z } from 'zod';
import { FlowNodeType } from './enums.js';

/**
 * The typed flow-graph model (Day 17) — the builder's soul. A FlowVersion.graph is a
 * `{ nodes, edges }` document authored on the React Flow canvas. This schema is the
 * single source of truth: the web canvas serialises to it, the API stores it verbatim,
 * and the compiler (Day 22) reads it. Keep it provider-agnostic and self-describing.
 */

export const nodeTypeSchema = z.enum([
  FlowNodeType.START,
  FlowNodeType.SAY,
  FlowNodeType.LISTEN,
  FlowNodeType.DECISION,
  FlowNodeType.TOOL,
  FlowNodeType.KNOWLEDGE,
  FlowNodeType.TRANSFER,
  FlowNodeType.COLLECT_CONFIRM,
  FlowNodeType.SUBFLOW,
  FlowNodeType.SQUAD_HANDOFF,
  FlowNodeType.PAYMENT,
  FlowNodeType.END,
]);

export const positionSchema = z.object({ x: z.number(), y: z.number() });

/**
 * Per-node config is refined per type on Day 18; here `data` holds the display label and
 * an open `config` record so the model round-trips today without losing type-specific fields.
 */
export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: nodeTypeSchema,
  position: positionSchema,
  data: z
    .object({
      label: z.string().max(120).optional(),
      config: z.record(z.string(), z.unknown()).default({}),
    })
    .default({ config: {} }),
});

/** Edge condition (evaluated by the compiler); optional — most edges are unconditional. */
export const edgeConditionSchema = z.object({
  kind: z.enum(['always', 'expression', 'intent', 'else']).default('always'),
  expression: z.string().max(500).optional(),
});

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
  condition: edgeConditionSchema.optional(),
});

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema).default([]),
  edges: z.array(flowEdgeSchema).default([]),
});

export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
export type FlowGraph = z.infer<typeof flowGraphSchema>;

/** An empty starter graph (a single START node) for a new flow version. */
export function emptyFlowGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: FlowNodeType.START, position: { x: 0, y: 0 }, data: { config: {} } },
    ],
    edges: [],
  };
}

/** Parse an untrusted graph (from the API/DB) into the typed model, or throw. */
export function parseFlowGraph(value: unknown): FlowGraph {
  return flowGraphSchema.parse(value);
}

// ── Validation (self-audit focus A — graph integrity) ─────────────────────────

export type FlowGraphErrorCode =
  | 'DUPLICATE_NODE_ID'
  | 'NO_START'
  | 'MULTIPLE_START'
  | 'NO_END'
  | 'DANGLING_EDGE'
  | 'START_HAS_INCOMING'
  | 'END_HAS_OUTGOING'
  | 'ORPHAN_NODE';

export interface FlowGraphError {
  code: FlowGraphErrorCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/**
 * Structural validation of a graph. Returns all problems (not just the first) so the
 * canvas can surface inline errors. Semantic per-node validation lands with the compiler.
 */
export function validateFlowGraph(graph: FlowGraph): { valid: boolean; errors: FlowGraphError[] } {
  const errors: FlowGraphError[] = [];
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const node of graph.nodes) {
    if (seen.has(node.id)) {
      errors.push({
        code: 'DUPLICATE_NODE_ID',
        message: `Duplicate node id "${node.id}"`,
        nodeId: node.id,
      });
    }
    seen.add(node.id);
    ids.add(node.id);
  }

  const starts = graph.nodes.filter((n) => n.type === FlowNodeType.START);
  const ends = graph.nodes.filter((n) => n.type === FlowNodeType.END);
  if (starts.length === 0) errors.push({ code: 'NO_START', message: 'A flow needs a Start node' });
  if (starts.length > 1)
    errors.push({
      code: 'MULTIPLE_START',
      message: 'A flow can have only one Start node',
      ...(starts[1] ? { nodeId: starts[1].id } : {}),
    });
  if (ends.length === 0)
    errors.push({ code: 'NO_END', message: 'A flow needs at least one End node' });

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push({
        code: 'DANGLING_EDGE',
        message: 'Edge references a missing node',
        edgeId: edge.id,
      });
      continue;
    }
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  for (const s of starts) {
    if ((incoming.get(s.id) ?? 0) > 0)
      errors.push({
        code: 'START_HAS_INCOMING',
        message: 'Start cannot have incoming edges',
        nodeId: s.id,
      });
  }
  for (const e of ends) {
    if ((outgoing.get(e.id) ?? 0) > 0)
      errors.push({
        code: 'END_HAS_OUTGOING',
        message: 'End cannot have outgoing edges',
        nodeId: e.id,
      });
  }

  // Orphans: a non-Start node with no incoming edge is unreachable.
  for (const node of graph.nodes) {
    if (node.type === FlowNodeType.START) continue;
    if ((incoming.get(node.id) ?? 0) === 0)
      errors.push({
        code: 'ORPHAN_NODE',
        message: `"${node.data.label ?? node.type}" is not connected`,
        nodeId: node.id,
      });
  }

  return { valid: errors.length === 0, errors };
}
