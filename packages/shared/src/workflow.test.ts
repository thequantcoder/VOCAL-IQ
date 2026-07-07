import { describe, expect, it } from 'vitest';
import type { AutomationEvent } from './automation.js';
import {
  type WorkflowContext,
  type WorkflowGraph,
  evalCondition,
  nextNodeId,
  nodeAction,
  triggerMatches,
  validateWorkflowGraph,
  workflowActionLabel,
} from './workflow.js';

const ctx = (
  event: Partial<AutomationEvent>,
  vars: Record<string, unknown> = {},
): WorkflowContext => ({
  event: { event: 'call_ended', ...event } as AutomationEvent,
  vars,
});

/** A valid linear-plus-branch graph: TRIGGER → COND → (true: ACTION → END) (false: END2). */
function goodGraph(): WorkflowGraph {
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

describe('evalCondition (self-audit A — pure + total)', () => {
  it('handles eq / ne / contains / exists', () => {
    const c = ctx({ disposition: 'BOOKED' });
    expect(evalCondition({ field: 'disposition', op: 'eq', value: 'BOOKED' }, c)).toBe(true);
    expect(evalCondition({ field: 'disposition', op: 'ne', value: 'BOOKED' }, c)).toBe(false);
    expect(evalCondition({ field: 'disposition', op: 'contains', value: 'OOK' }, c)).toBe(true);
    expect(evalCondition({ field: 'disposition', op: 'exists' }, c)).toBe(true);
    expect(evalCondition({ field: 'missing', op: 'exists' }, c)).toBe(false);
  });
  it('handles numeric gt / lt with coercion, false on NaN', () => {
    const c = ctx({}, { score: '80' });
    expect(evalCondition({ field: 'score', op: 'gt', value: '50' }, c)).toBe(true);
    expect(evalCondition({ field: 'score', op: 'lt', value: '50' }, c)).toBe(false);
    expect(evalCondition({ field: 'score', op: 'gt', value: 'abc' }, c)).toBe(false); // NaN → false
  });
  it('vars override event fields', () => {
    const c = ctx({ disposition: 'A' }, { disposition: 'B' });
    expect(evalCondition({ field: 'disposition', op: 'eq', value: 'B' }, c)).toBe(true);
  });
});

describe('nextNodeId (self-audit A — deterministic branching)', () => {
  const g = goodGraph();
  it('follows the single outgoing edge for non-condition nodes', () => {
    expect(nextNodeId(g, 't', ctx({}))).toBe('c');
    expect(nextNodeId(g, 'a', ctx({}))).toBe('e1');
  });
  it('branches a condition on the true/false handle', () => {
    expect(nextNodeId(g, 'c', ctx({ disposition: 'BOOKED' }))).toBe('a'); // true branch
    expect(nextNodeId(g, 'c', ctx({ disposition: 'NO_ANSWER' }))).toBe('e2'); // false branch
  });
  it('returns null at an END node or when there is no outgoing edge', () => {
    expect(nextNodeId(g, 'e1', ctx({}))).toBeNull();
    expect(nextNodeId(g, 'unknown', ctx({}))).toBeNull();
  });
});

describe('triggerMatches (reuses the Day-47 matcher)', () => {
  it('fires only on the configured event + filters', () => {
    const g = goodGraph();
    expect(triggerMatches(g, { event: 'call_ended' })).toBe(true);
    expect(triggerMatches(g, { event: 'lead_status_changed' })).toBe(false);
  });
  it('respects a trigger filter', () => {
    const g = goodGraph();
    g.nodes[0]!.data.config = { event: 'call_ended', filters: { disposition: 'BOOKED' } };
    expect(triggerMatches(g, { event: 'call_ended', disposition: 'BOOKED' })).toBe(true);
    expect(triggerMatches(g, { event: 'call_ended', disposition: 'NO_ANSWER' })).toBe(false);
  });
});

describe('validateWorkflowGraph (self-audit A — safe to execute)', () => {
  it('accepts a well-formed graph', () => {
    expect(validateWorkflowGraph(goodGraph())).toEqual([]);
  });
  it('requires exactly one trigger', () => {
    const g = goodGraph();
    g.nodes = g.nodes.filter((n) => n.type !== 'TRIGGER');
    expect(validateWorkflowGraph(g).some((e) => e.code === 'NO_TRIGGER')).toBe(true);
  });
  it('flags a condition missing a branch', () => {
    const g = goodGraph();
    g.edges = g.edges.filter((e) => e.id !== 'c-e2'); // drop the false branch
    expect(validateWorkflowGraph(g).some((e) => e.code === 'CONDITION_BRANCHES')).toBe(true);
  });
  it('flags a dangling edge', () => {
    const g = goodGraph();
    g.edges.push({ id: 'bad', source: 'a', target: 'ghost' });
    expect(validateWorkflowGraph(g).some((e) => e.code === 'DANGLING_EDGE')).toBe(true);
  });
  it('flags a cycle (guarantees termination)', () => {
    const g = goodGraph();
    g.edges.push({ id: 'e1-t', source: 'e1', target: 't' }); // creates a loop
    const errs = validateWorkflowGraph(g);
    expect(errs.some((e) => e.code === 'CYCLE')).toBe(true);
  });
  it('flags a fan-out (multiple outgoing edges) on a trigger/action — no fork node exists', () => {
    const g = goodGraph();
    // A second edge out of the trigger → the engine would silently drop one branch.
    g.edges.push({ id: 't-e2', source: 't', target: 'e2' });
    expect(validateWorkflowGraph(g).some((e) => e.code === 'TRIGGER_EDGES')).toBe(true);
  });
  it('flags a condition with a duplicate true branch (ambiguous)', () => {
    const g = goodGraph();
    g.edges.push({ id: 'c-a2', source: 'c', target: 'e1', sourceHandle: 'true' });
    expect(validateWorkflowGraph(g).some((e) => e.code === 'CONDITION_BRANCHES')).toBe(true);
  });
  it('flags an invalid action config + a trigger with an incoming edge', () => {
    const g = goodGraph();
    g.nodes.find((n) => n.id === 'a')!.data.config = {
      action: { type: 'webhook', url: 'not-a-url' },
    };
    g.edges.push({ id: 'a-t', source: 'a', target: 't' });
    const errs = validateWorkflowGraph(g);
    expect(errs.some((e) => e.code === 'BAD_ACTION')).toBe(true);
    expect(errs.some((e) => e.code === 'TRIGGER_INCOMING')).toBe(true);
  });
});

describe('nodeAction + labels', () => {
  it('parses a valid action and labels it', () => {
    const g = goodGraph();
    const action = nodeAction(g.nodes.find((n) => n.id === 'a')!);
    expect(action).toEqual({ type: 'notify', message: 'Booked!' });
    expect(workflowActionLabel(action!)).toBe('Notify: Booked!');
    expect(
      workflowActionLabel({ type: 'webhook', url: 'https://x.example.com', includeContext: true }),
    ).toBe('POST webhook');
  });
  it('rejects an invalid action config', () => {
    const g = goodGraph();
    g.nodes.find((n) => n.id === 'a')!.data.config = { action: { type: 'webhook', url: 'nope' } };
    expect(nodeAction(g.nodes.find((n) => n.id === 'a')!)).toBeNull();
  });
});
