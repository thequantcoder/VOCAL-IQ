import { describe, expect, it, vi } from 'vitest';
import type { CompiledFlow } from './flow-compiler.js';
import {
  type RubricGrader,
  type Scenario,
  detectRegressions,
  runScenario,
  runSuite,
} from './scenario.js';

/** START → SAY → LISTEN(capture reason) → DECISION(intent) → {booked END | bye END}. */
const FLOW: CompiledFlow = {
  entry: 'start',
  nodes: {
    start: {
      id: 'start',
      type: 'START',
      config: { openingLine: 'Hi, this is Ada.' },
      captures: [],
      transitions: [{ target: 'ask', kind: 'always' }],
    },
    ask: {
      id: 'ask',
      type: 'SAY',
      config: { mode: 'scripted', text: 'How can I help?' },
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

const bookingScenario: Scenario = {
  name: 'happy path booking',
  caller: [{ text: 'I want to book an appointment', intent: 'booking' }],
  assertions: [
    { type: 'outcome_is', value: 'booked' },
    { type: 'visited', nodeId: 'booked' },
    { type: 'captured', name: 'reason' },
    { type: 'transcript_includes', text: 'book an appointment' },
    { type: 'max_turns', value: 3 },
    { type: 'cost_under', value: 1 },
  ],
};

describe('runScenario (deterministic assertions)', () => {
  it('passes every assertion on the happy path', async () => {
    const res = await runScenario(FLOW, bookingScenario);
    expect(res.passed).toBe(true);
    expect(res.outcome).toBe('booked');
    expect(res.results.every((r) => r.pass)).toBe(true);
  });

  it('fails the outcome assertion when the caller does not book', async () => {
    const res = await runScenario(FLOW, {
      name: 'browser',
      caller: [{ text: 'just looking', intent: 'chitchat' }],
      assertions: [{ type: 'outcome_is', value: 'booked' }],
    });
    expect(res.passed).toBe(false);
    expect(res.results[0]?.detail).toContain('no_booking');
  });

  it('is deterministic — same scenario grades identically every run', async () => {
    const a = await runScenario(FLOW, bookingScenario);
    const b = await runScenario(FLOW, bookingScenario);
    expect(a.results.map((r) => r.pass)).toEqual(b.results.map((r) => r.pass));
  });
});

describe('llm_rubric grading (injected grader)', () => {
  it('uses the grader for rubric assertions and meters via it', async () => {
    const grader: RubricGrader = vi.fn(async ({ outcome }) => ({
      pass: outcome === 'booked',
      reason: 'confirmed booking',
    }));
    const res = await runScenario(
      FLOW,
      {
        name: 'rubric',
        caller: [{ text: 'book me', intent: 'booking' }],
        assertions: [{ type: 'llm_rubric', prompt: 'Did the agent confirm the appointment?' }],
      },
      { grader },
    );
    expect(grader).toHaveBeenCalledOnce();
    expect(res.passed).toBe(true);
    expect(res.results[0]?.detail).toBe('confirmed booking');
  });

  it('fails a rubric assertion (does not silently pass) when no grader is configured', async () => {
    const res = await runScenario(FLOW, {
      name: 'no grader',
      caller: [{ text: 'book me', intent: 'booking' }],
      assertions: [{ type: 'llm_rubric', prompt: 'On script?' }],
    });
    expect(res.passed).toBe(false);
    expect(res.results[0]?.detail).toBe('no grader configured');
  });
});

describe('runSuite + regression detection', () => {
  it('aggregates pass/fail + cost across scenarios', async () => {
    const report = await runSuite(FLOW, [
      bookingScenario,
      {
        name: 'fails',
        caller: [{ text: 'no', intent: 'x' }],
        assertions: [{ type: 'outcome_is', value: 'booked' }],
      },
    ]);
    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.passRate).toBe(0.5);
  });

  it('flags a scenario that regressed from a passing baseline', async () => {
    const baseline = await runSuite(FLOW, [bookingScenario]); // passes
    // Same scenario name but now asserts the wrong outcome → fails.
    const current = await runSuite(FLOW, [
      { ...bookingScenario, assertions: [{ type: 'outcome_is', value: 'no_booking' }] },
    ]);
    expect(detectRegressions(current, baseline)).toEqual(['happy path booking']);
  });
});
