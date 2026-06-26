import { describe, expect, it } from 'vitest';
import { embeddingCostUsd, llmCostUsd } from './pricing.js';

describe('pricing', () => {
  it('computes LLM cost from input/output token prices', () => {
    // gpt-4o-mini: $0.15/$0.60 per 1M → 10 in + 5 out
    expect(llmCostUsd('gpt-4o-mini', 10, 5)).toBeCloseTo((10 * 0.15 + 5 * 0.6) / 1_000_000, 12);
    // claude-opus-4-8: $5/$25 per 1M
    expect(llmCostUsd('claude-opus-4-8', 1000, 1000)).toBeCloseTo(
      (1000 * 5 + 1000 * 25) / 1_000_000,
      12,
    );
  });

  it('returns 0 for unknown models (no silent overcharge)', () => {
    expect(llmCostUsd('mystery-model', 100, 100)).toBe(0);
    expect(embeddingCostUsd('mystery-embed', 100)).toBe(0);
  });

  it('computes embedding cost', () => {
    expect(embeddingCostUsd('text-embedding-3-small', 1_000_000)).toBeCloseTo(0.02, 10);
  });
});
