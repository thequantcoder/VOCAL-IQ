import { Provider, isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { OpenRouterLLM } from './openrouter.js';

describe('OpenRouterLLM', () => {
  it('reports the OpenRouter provider, llm capability, and a namespaced default model', () => {
    const llm = new OpenRouterLLM('KEY');
    expect(llm.provider).toBe(Provider.OPENROUTER);
    expect(llm.capability).toBe('llm');
    expect(llm.defaultModel).toContain('/'); // OpenRouter models are namespaced (e.g. openai/gpt-4o-mini)
  });

  it('throws a typed ProviderError for embeddings (not supported)', async () => {
    await expect(new OpenRouterLLM('KEY').embed('hi')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'PROVIDER',
    );
  });
});
