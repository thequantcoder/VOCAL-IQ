import { describe, expect, it, vi } from 'vitest';
import { type QaDeps, type QaSaved, runQaScoring } from './qa-scoring';

/** QA scoring orchestration (Day 43): fetch → sample → metered LLM → parse → save. */

const RUBRIC = {
  id: 'rub-1',
  name: 'Sales QA',
  criteria: [
    { key: 'greeting', description: 'greeted', weight: 1 },
    { key: 'booking', description: 'booked', weight: 3 },
  ],
  samplingRate: 1,
};

const GOOD_JSON = JSON.stringify({
  results: [
    { key: 'greeting', score: 1, reason: 'greeted' },
    { key: 'booking', score: 1, reason: 'booked' },
  ],
});

function baseDeps(over: Partial<QaDeps> = {}): {
  deps: QaDeps;
  saved: QaSaved[];
  complete: ReturnType<typeof vi.fn>;
} {
  const saved: QaSaved[] = [];
  const complete = vi.fn(async () => ({ text: GOOD_JSON, model: 'gpt-4o-mini' }));
  const deps: QaDeps = {
    fetchCall: async () => ({
      tenantId: 't1',
      agentId: 'a1',
      segments: [{ speaker: 'agent', text: 'Hello, VocalIQ here. Booked you for Tuesday.' }],
    }),
    fetchRubrics: async () => [RUBRIC],
    complete,
    saveScore: async (_callId, score) => {
      saved.push(score);
    },
    log: () => {},
    ...over,
  };
  return { deps, saved, complete };
}

describe('runQaScoring', () => {
  it('scores every applicable rubric and saves a weighted overall (metered LLM path)', async () => {
    const { deps, saved, complete } = baseDeps();
    const res = await runQaScoring(deps, 'call-1');
    expect(res).toEqual({ status: 'ok', scored: 1, sampledOut: 0 });
    expect(complete).toHaveBeenCalledOnce();
    expect(saved[0]?.rubricId).toBe('rub-1');
    expect(saved[0]?.model).toBe('gpt-4o-mini');
    expect(saved[0]?.overall).toBe(100); // greeting(1,w1)+booking(1,w3) all met
  });

  it('skips the LLM entirely for an empty transcript (no wasted spend)', async () => {
    const { deps, complete } = baseDeps({
      fetchCall: async () => ({ tenantId: 't1', agentId: 'a1', segments: [] }),
    });
    const res = await runQaScoring(deps, 'call-2');
    expect(res).toEqual({ status: 'empty' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns no_rubrics (no spend) when the tenant has no active rubric', async () => {
    const { deps, complete } = baseDeps({ fetchRubrics: async () => [] });
    const res = await runQaScoring(deps, 'call-3');
    expect(res).toEqual({ status: 'no_rubrics' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('cost-aware: a sampled-out rubric never calls the LLM', async () => {
    // rate 0 → shouldSample is always false → no completion, counted as sampledOut.
    const { deps, complete } = baseDeps({
      fetchRubrics: async () => [{ ...RUBRIC, samplingRate: 0 }],
    });
    const res = await runQaScoring(deps, 'call-4');
    expect(res).toEqual({ status: 'ok', scored: 0, sampledOut: 1 });
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns not_found for a call with no transcript', async () => {
    const { deps } = baseDeps({ fetchCall: async () => null });
    expect(await runQaScoring(deps, 'nope')).toEqual({ status: 'not_found' });
  });

  it('fails closed on garbage model output (criteria default to 0)', async () => {
    const { deps, saved } = baseDeps({
      complete: vi.fn(async () => ({ text: 'the model refused', model: 'gpt-4o-mini' })),
    });
    const res = await runQaScoring(deps, 'call-5');
    expect(res.status).toBe('ok');
    expect(saved[0]?.overall).toBe(0);
    expect(saved[0]?.criteria.every((c) => c.score === 0)).toBe(true);
  });
});
