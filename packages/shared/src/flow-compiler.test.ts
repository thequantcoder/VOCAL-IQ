import { describe, expect, it } from 'vitest';
import { FlowNodeType } from './enums';
import { FlowRunner, compileFlow, nextNode } from './flow-compiler';
import type { FlowGraph } from './flow-graph';

const n = (id: string, type: string, config: Record<string, unknown> = {}) => ({
  id,
  type: type as FlowGraph['nodes'][number]['type'],
  position: { x: 0, y: 0 },
  data: { config },
});

/** START → SAY → LISTEN → DECISION →(intent book)→ END_BOOK ; →(else)→ END_BYE */
function branchingGraph(): FlowGraph {
  return {
    nodes: [
      n('start', 'START'),
      n('say', 'SAY', { mode: 'scripted', text: 'Hi' }),
      n('listen', 'LISTEN'),
      n('decide', 'DECISION'),
      n('end_book', 'END', { outcome: 'booked' }),
      n('end_bye', 'END', { outcome: 'bye' }),
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'say' },
      { id: 'e2', source: 'say', target: 'listen' },
      { id: 'e3', source: 'listen', target: 'decide' },
      {
        id: 'e4',
        source: 'decide',
        target: 'end_book',
        condition: { kind: 'intent', expression: 'book' },
      },
      { id: 'e5', source: 'decide', target: 'end_bye', condition: { kind: 'else' } },
    ],
  };
}

describe('compileFlow', () => {
  it('compiles a valid branching graph to a runnable spec', () => {
    const res = compileFlow(branchingGraph());
    expect(res.ok).toBe(true);
    expect(res.flow?.entry).toBe('start');
    expect(res.flow?.nodes.decide?.transitions).toHaveLength(2);
    expect(res.errors).toEqual([]);
  });

  it('detects a dead-end (non-END node with no next)', () => {
    const g = branchingGraph();
    g.edges = g.edges.filter((e) => e.source !== 'say'); // say now dangles
    const res = compileFlow(g);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'DEAD_END' && e.nodeId === 'say')).toBe(true);
  });

  it('rejects a graph with no reachable End (termination guarantee)', () => {
    const g: FlowGraph = {
      nodes: [n('start', 'START'), n('a', 'SAY', { mode: 'scripted', text: 'x' }), n('end', 'END')],
      // a loops to itself; End exists but is unreachable from start.
      edges: [
        { id: 'e1', source: 'start', target: 'a' },
        { id: 'e2', source: 'a', target: 'a' },
      ],
    };
    const res = compileFlow(g);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'NO_REACHABLE_END')).toBe(true);
    expect(res.errors.some((e) => e.code === 'UNREACHABLE' && e.nodeId === 'end')).toBe(true);
  });

  it('requires a Decision to have a fallback branch', () => {
    const g = branchingGraph();
    g.edges = g.edges.map((e) =>
      e.id === 'e5' ? { ...e, condition: { kind: 'intent' as const, expression: 'bye' } } : e,
    );
    const res = compileFlow(g);
    expect(res.errors.some((e) => e.code === 'DECISION_NO_FALLBACK')).toBe(true);
  });

  it('allows a valid loop (cycle) as long as an End is reachable', () => {
    const g: FlowGraph = {
      nodes: [n('start', 'START'), n('ask', 'LISTEN'), n('d', 'DECISION'), n('end', 'END')],
      edges: [
        { id: 'e1', source: 'start', target: 'ask' },
        { id: 'e2', source: 'ask', target: 'd' },
        {
          id: 'e3',
          source: 'd',
          target: 'ask',
          condition: { kind: 'intent', expression: 'repeat' },
        },
        { id: 'e4', source: 'd', target: 'end', condition: { kind: 'else' } },
      ],
    };
    expect(compileFlow(g).ok).toBe(true);
  });
});

describe('runtime executor', () => {
  it('nextNode picks the matching branch deterministically', () => {
    const flow = compileFlow(branchingGraph()).flow;
    if (!flow) throw new Error('expected a compiled flow');
    expect(nextNode(flow, 'decide', { intent: 'book' })).toBe('end_book');
    expect(nextNode(flow, 'decide', { intent: 'nope' })).toBe('end_bye'); // else fallback
    expect(nextNode(flow, 'end_book')).toBeNull(); // END → no next
  });

  it('FlowRunner drives a full simulated conversation to an End', () => {
    const flow = compileFlow(branchingGraph()).flow;
    if (!flow) throw new Error('expected a compiled flow');
    const runner = new FlowRunner(flow);
    expect(runner.active).toBe('start');
    runner.advance(); // start → say
    runner.advance(); // say → listen
    runner.advance(); // listen → decide
    runner.advance({ intent: 'book' }); // decide → end_book
    expect(runner.done).toBe(true);
    expect(runner.history).toEqual(['start', 'say', 'listen', 'decide', 'end_book']);
    expect(runner.advance()).toBeNull(); // terminated
  });
});
