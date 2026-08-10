import { Provider, isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { llmCostUsd } from '../pricing.js';
import { SarvamLLM } from './sarvam-llm.js';

describe('SarvamLLM', () => {
  it('reports the Sarvam provider, llm capability, and an Indic default model', () => {
    const llm = new SarvamLLM('KEY');
    expect(llm.provider).toBe(Provider.SARVAM);
    expect(llm.capability).toBe('llm');
    expect(llm.defaultModel).toBe('sarvam-30b');
  });

  it('throws a typed ProviderError for embeddings (not supported)', async () => {
    await expect(new SarvamLLM('KEY').embed('namaste')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'PROVIDER',
    );
  });

  it('is metered by the pricing table (base + context-length variants resolve)', () => {
    // 1M in + 1M out on sarvam-30b → $0.03 + $0.12.
    expect(llmCostUsd('sarvam-30b', 1_000_000, 1_000_000)).toBeCloseTo(0.15, 6);
    // Context-length variant prefix-resolves to the base rate.
    expect(llmCostUsd('sarvam-105b-32k', 1_000_000, 0)).toBeCloseTo(0.048, 6);
    // Far cheaper than GPT-4o output ($15/1M) — the India cost win.
    expect(llmCostUsd('sarvam-30b', 0, 1_000_000)).toBeLessThan(llmCostUsd('gpt-4o', 0, 1_000_000));
  });
});
