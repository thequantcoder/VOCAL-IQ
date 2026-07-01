import { describe, expect, it } from 'vitest';
import { FlowNodeType } from './enums';
import {
  type FlowGraph,
  emptyFlowGraph,
  flowGraphSchema,
  parseFlowGraph,
  validateFlowGraph,
} from './flow-graph';

/** A minimal valid flow: START → SAY → END. */
function validGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: FlowNodeType.START, position: { x: 0, y: 0 }, data: { config: {} } },
      {
        id: 'say',
        type: FlowNodeType.SAY,
        position: { x: 200, y: 0 },
        data: { label: 'Greet', config: {} },
      },
      { id: 'end', type: FlowNodeType.END, position: { x: 400, y: 0 }, data: { config: {} } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'say' },
      { id: 'e2', source: 'say', target: 'end' },
    ],
  };
}

describe('flow-graph serialise/deserialise', () => {
  it('round-trips a graph through JSON without loss', () => {
    const graph = validGraph();
    const restored = parseFlowGraph(JSON.parse(JSON.stringify(graph)));
    expect(restored).toEqual(graph);
  });

  it('applies defaults (empty config, empty arrays)', () => {
    const parsed = flowGraphSchema.parse({
      nodes: [{ id: 'a', type: 'END', position: { x: 1, y: 2 } }],
    });
    expect(parsed.nodes[0]?.data.config).toEqual({});
    expect(parsed.edges).toEqual([]);
  });

  it('rejects an unknown node type', () => {
    expect(() =>
      parseFlowGraph({ nodes: [{ id: 'x', type: 'NOPE', position: { x: 0, y: 0 } }] }),
    ).toThrow();
  });

  it('emptyFlowGraph is a single START node', () => {
    const g = emptyFlowGraph();
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]?.type).toBe('START');
  });
});

describe('validateFlowGraph', () => {
  it('accepts a well-formed START → SAY → END graph', () => {
    expect(validateFlowGraph(validGraph())).toEqual({ valid: true, errors: [] });
  });

  it('flags a missing Start and End', () => {
    const res = validateFlowGraph({
      nodes: [
        { id: 'say', type: FlowNodeType.SAY, position: { x: 0, y: 0 }, data: { config: {} } },
      ],
      edges: [],
    });
    const codes = res.errors.map((e) => e.code);
    expect(res.valid).toBe(false);
    expect(codes).toContain('NO_START');
    expect(codes).toContain('NO_END');
  });

  it('flags duplicate node ids', () => {
    const g = validGraph();
    g.nodes.push({
      id: 'say',
      type: FlowNodeType.SAY,
      position: { x: 0, y: 0 },
      data: { config: {} },
    });
    expect(validateFlowGraph(g).errors.map((e) => e.code)).toContain('DUPLICATE_NODE_ID');
  });

  it('flags a dangling edge', () => {
    const g = validGraph();
    g.edges.push({ id: 'bad', source: 'say', target: 'ghost' });
    expect(validateFlowGraph(g).errors.map((e) => e.code)).toContain('DANGLING_EDGE');
  });

  it('flags an orphan node (no incoming edge)', () => {
    const g = validGraph();
    g.nodes.push({
      id: 'lonely',
      type: FlowNodeType.SAY,
      position: { x: 0, y: 0 },
      data: { config: {} },
    });
    const res = validateFlowGraph(g);
    expect(res.errors.some((e) => e.code === 'ORPHAN_NODE' && e.nodeId === 'lonely')).toBe(true);
  });

  it('flags Start with incoming and End with outgoing edges', () => {
    const g = validGraph();
    g.edges.push({ id: 'e3', source: 'end', target: 'start' });
    const codes = validateFlowGraph(g).errors.map((e) => e.code);
    expect(codes).toContain('START_HAS_INCOMING');
    expect(codes).toContain('END_HAS_OUTGOING');
  });
});
