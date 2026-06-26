import { describe, expect, it } from 'vitest';
import { Capability } from './enums.js';
import { addCost, emptyCostBreakdown } from './usage.js';

describe('cost breakdown', () => {
  it('starts zeroed', () => {
    expect(emptyCostBreakdown()).toEqual({ stt: 0, llm: 0, tts: 0, telephony: 0, total: 0 });
  });

  it('routes each capability to its bucket and keeps total consistent', () => {
    let b = emptyCostBreakdown();
    b = addCost(b, Capability.STT, 0.01);
    b = addCost(b, Capability.LLM, 0.05);
    b = addCost(b, Capability.TTS, 0.02);
    b = addCost(b, Capability.TELEPHONY, 0.03);
    expect(b).toEqual({ stt: 0.01, llm: 0.05, tts: 0.02, telephony: 0.03, total: 0.11 });
  });

  it('folds embedding cost into the llm bucket', () => {
    const b = addCost(emptyCostBreakdown(), Capability.EMBEDDING, 0.004);
    expect(b.llm).toBe(0.004);
    expect(b.total).toBe(0.004);
  });

  it('is pure — does not mutate the input', () => {
    const start = emptyCostBreakdown();
    addCost(start, Capability.LLM, 1);
    expect(start.llm).toBe(0);
  });
});
