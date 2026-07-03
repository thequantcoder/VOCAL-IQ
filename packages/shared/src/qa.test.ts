import { describe, expect, it } from 'vitest';
import {
  type QaCriterion,
  aggregateQaScores,
  buildQaPrompt,
  parseQaResult,
  qaRubricInputSchema,
  scoreQa,
  shouldSample,
} from './qa.js';

const CRITERIA: QaCriterion[] = [
  { key: 'greeting', description: 'Agent greeted and identified the company', weight: 1 },
  { key: 'booking', description: 'Confirmed a booking', weight: 3 },
  { key: 'compliant', description: 'Disclosed the call is recorded', weight: 2 },
];

describe('qaRubricInputSchema', () => {
  it('accepts a valid rubric and defaults samplingRate + active', () => {
    const r = qaRubricInputSchema.parse({
      name: 'Sales QA',
      criteria: [{ key: 'greeting', description: 'greeted', weight: 2 }],
    });
    expect(r.samplingRate).toBe(1);
    expect(r.active).toBe(true);
  });
  it('rejects a criterion key with spaces/uppercase and an empty rubric', () => {
    expect(() =>
      qaRubricInputSchema.parse({ name: 'x', criteria: [{ key: 'Bad Key', description: 'd' }] }),
    ).toThrow();
    expect(() => qaRubricInputSchema.parse({ name: 'x', criteria: [] })).toThrow();
  });
});

describe('buildQaPrompt', () => {
  it('lists every criterion key and asks for strict JSON', () => {
    const { system, user } = buildQaPrompt(CRITERIA, 'agent: hello');
    expect(system).toContain('JSON');
    expect(user).toContain('"greeting"');
    expect(user).toContain('"booking"');
    expect(user).toContain('agent: hello');
  });
});

describe('parseQaResult', () => {
  it('maps model scores by key and clamps to 0..1', () => {
    const raw = JSON.stringify({
      results: [
        { key: 'greeting', score: 1, reason: 'greeted' },
        { key: 'booking', score: 1.4, reason: 'booked' }, // clamps to 1
        { key: 'compliant', score: -3, reason: 'no disclosure' }, // clamps to 0
      ],
    });
    const scores = parseQaResult(raw, CRITERIA);
    expect(scores.find((s) => s.key === 'booking')?.score).toBe(1);
    expect(scores.find((s) => s.key === 'compliant')?.score).toBe(0);
  });

  it('extracts JSON even when wrapped in prose/fences', () => {
    const raw = 'Here you go:\n```json\n{"results":[{"key":"greeting","score":0.5}]}\n```';
    const scores = parseQaResult(raw, CRITERIA);
    expect(scores.find((s) => s.key === 'greeting')?.score).toBe(0.5);
  });

  it('fails closed: an omitted or unparseable criterion defaults to 0 (never skipped)', () => {
    const scores = parseQaResult('not json at all', CRITERIA);
    expect(scores).toHaveLength(3);
    expect(scores.every((s) => s.score === 0)).toBe(true);
    expect(scores[0]?.reason).toBe('not evaluated');
  });
});

describe('scoreQa (weighted overall)', () => {
  it('computes a weight-weighted 0..100 overall', () => {
    // greeting=1 (w1), booking=1 (w3), compliant=0 (w2) → (1+3+0)/6 *100 = 66.7
    const parsed = parseQaResult(
      JSON.stringify({
        results: [
          { key: 'greeting', score: 1 },
          { key: 'booking', score: 1 },
          { key: 'compliant', score: 0 },
        ],
      }),
      CRITERIA,
    );
    expect(scoreQa(parsed).overall).toBeCloseTo(66.7, 1);
  });
  it('is 0 when all weights are zeroed out (guarded)', () => {
    expect(scoreQa([]).overall).toBe(0);
  });
});

describe('shouldSample (deterministic cost-aware sampling)', () => {
  it('always scores at rate>=1 and never at rate<=0', () => {
    expect(shouldSample(1, 'call-a:rub-1')).toBe(true);
    expect(shouldSample(0, 'call-a:rub-1')).toBe(false);
  });
  it('is stable for the same seed (idempotent re-scoring)', () => {
    const a = shouldSample(0.5, 'call-xyz:rub-1');
    const b = shouldSample(0.5, 'call-xyz:rub-1');
    expect(a).toBe(b);
  });
  it('approximates the rate across many seeds', () => {
    let hits = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (shouldSample(0.25, `call-${i}:rub`)) hits++;
    const frac = hits / N;
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.3);
  });
});

describe('aggregateQaScores', () => {
  it('averages overall + per-criterion across calls of a rubric', () => {
    const agg = aggregateQaScores([
      {
        rubricId: 'r1',
        overall: 100,
        criteria: [{ key: 'greeting', score: 1, weight: 1, reason: '' }],
      },
      {
        rubricId: 'r1',
        overall: 0,
        criteria: [{ key: 'greeting', score: 0, weight: 1, reason: '' }],
      },
    ]);
    expect(agg).toHaveLength(1);
    expect(agg[0]?.avgOverall).toBe(50);
    expect(agg[0]?.count).toBe(2);
    expect(agg[0]?.criteria[0]?.avgScore).toBe(0.5);
  });
});
