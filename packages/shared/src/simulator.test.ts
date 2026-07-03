import { describe, expect, it } from 'vitest';
import type { CompiledFlow } from './flow-compiler.js';
import { type SimEvent, runSimulation, scriptedCaller } from './simulator.js';

/**
 * A small compiled flow: START → SAY → LISTEN(capture reason) → DECISION(intent) →
 * {booking END | else END}. Built as a CompiledFlow literal so the sim is tested in
 * isolation from the compiler.
 */
const FLOW: CompiledFlow = {
  entry: 'start',
  nodes: {
    start: {
      id: 'start',
      type: 'START',
      config: { openingLine: 'Hi, this is Ada. How can I help?' },
      captures: [],
      transitions: [{ target: 'ask', kind: 'always' }],
    },
    ask: {
      id: 'ask',
      type: 'SAY',
      config: { mode: 'scripted', text: 'What do you need today?' },
      captures: [],
      transitions: [{ target: 'listen', kind: 'always' }],
    },
    listen: {
      id: 'listen',
      type: 'LISTEN',
      config: {},
      captures: [{ name: 'reason', type: 'text', required: true }],
      transitions: [{ target: 'decide', kind: 'always' }],
    },
    decide: {
      id: 'decide',
      type: 'DECISION',
      config: {},
      captures: [],
      transitions: [
        { target: 'booked', kind: 'intent', expression: 'booking' },
        { target: 'bye', kind: 'else' },
      ],
    },
    booked: {
      id: 'booked',
      type: 'END',
      config: { outcome: 'booked' },
      captures: [],
      transitions: [],
    },
    bye: {
      id: 'bye',
      type: 'END',
      config: { outcome: 'no_booking' },
      captures: [],
      transitions: [],
    },
  },
};

describe('runSimulation', () => {
  it('drives a full conversation deterministically and routes on caller intent', () => {
    const caller = scriptedCaller([{ text: 'I want to book an appointment', intent: 'booking' }]);
    const res = runSimulation(FLOW, caller);

    expect(res.outcome).toBe('booked');
    expect(res.transcript).toEqual([
      { role: 'agent', text: 'Hi, this is Ada. How can I help?' },
      { role: 'agent', text: 'What do you need today?' },
      { role: 'caller', text: 'I want to book an appointment' },
    ]);
    expect(res.visited).toEqual(['start', 'ask', 'listen', 'decide', 'booked']);

    // Event-stream correctness: the capture fired with the listen node's variable.
    const capture = res.events.find(
      (e): e is Extract<SimEvent, { kind: 'capture' }> => e.kind === 'capture',
    );
    expect(capture?.vars).toEqual({ reason: 'I want to book an appointment' });
    const end = res.events.find((e): e is Extract<SimEvent, { kind: 'end' }> => e.kind === 'end');
    expect(end?.outcome).toBe('booked');
  });

  it('routes to the else branch when the intent does not match', () => {
    const res = runSimulation(
      FLOW,
      scriptedCaller([{ text: 'just browsing', intent: 'chitchat' }]),
    );
    expect(res.outcome).toBe('no_booking');
    expect(res.visited).toContain('bye');
  });

  it('halts when the caller hangs up at a listen', () => {
    const res = runSimulation(FLOW, scriptedCaller([])); // no lines → hangs up at listen
    expect(res.outcome).toBe('caller_ended');
    expect(res.events.at(-1)).toEqual({ kind: 'halt', reason: 'caller_ended' });
  });

  it('a scripted caller incurs no LLM cost (free sandbox run)', () => {
    const res = runSimulation(FLOW, scriptedCaller([{ text: 'book it', intent: 'booking' }]));
    expect(res.estCostUsd).toBe(0); // no generated Say nodes, scripted caller
  });

  it('estimates cost when the agent generates a turn', () => {
    const flow: CompiledFlow = {
      entry: 's',
      nodes: {
        s: {
          id: 's',
          type: 'SAY',
          config: { mode: 'generated', prompt: 'Greet the caller warmly and ask their name.' },
          captures: [],
          transitions: [{ target: 'e', kind: 'always' }],
        },
        e: { id: 'e', type: 'END', config: { outcome: 'done' }, captures: [], transitions: [] },
      },
    };
    const res = runSimulation(flow, scriptedCaller([]));
    expect(res.estCostUsd).toBeGreaterThan(0);
  });

  it('terminates on a cyclic flow via the hard step cap', () => {
    const loop: CompiledFlow = {
      entry: 'a',
      nodes: {
        a: {
          id: 'a',
          type: 'SAY',
          config: { mode: 'scripted', text: 'loop' },
          captures: [],
          transitions: [{ target: 'a', kind: 'always' }],
        },
      },
    };
    const res = runSimulation(loop, scriptedCaller([]), { maxTurns: 5 });
    expect(res.outcome).toBe('max_turns');
    expect(res.visited.length).toBeLessThanOrEqual(31); // maxTurns*6 + 1
  });
});
