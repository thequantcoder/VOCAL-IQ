import { resolve } from 'node:path';
import { Provider } from '@vocaliq/shared';
import { config as loadDotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import type { KeyResolver, UsageMeter } from './index.js';
import { Router } from './router.js';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

/**
 * Live proof: a real text completion routed through the Router that records cost.
 * Skips when no provider key is present (CI), so it never blocks the gate but proves
 * the end-to-end path locally (DoD: "live ... real completion + cost").
 */
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const live = hasOpenAI || hasAnthropic ? describe : describe.skip;

live('Router (live providers)', () => {
  // Platform-key resolver: managed mode, read from env (no BYOK).
  const resolveKey: KeyResolver = async (_tenantId, provider) => {
    const key =
      provider === Provider.OPENAI ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error(`no key for ${provider}`);
    return { apiKey: key, byok: false };
  };

  it('completes a prompt and emits a UsageRecord with positive cost', async () => {
    const records: Parameters<UsageMeter>[0][] = [];
    const meter: UsageMeter = async (r) => {
      records.push(r);
    };
    // Prefer whichever provider has a key.
    const order = hasOpenAI ? [Provider.OPENAI, Provider.ANTHROPIC] : [Provider.ANTHROPIC];
    const router = new Router({ resolveKey, meter, llmOrder: order });

    const res = await router
      .selectLLM({ tenantId: 'live-test', capability: 'llm' })
      .complete([{ role: 'user', content: 'Reply with exactly the word: pong' }], {
        maxTokens: 16,
        system: 'You are a terse test assistant.',
      });

    expect(res.text.toLowerCase()).toContain('pong');
    expect(records).toHaveLength(1);
    expect(records[0]?.units).toBeGreaterThan(0);
    expect(records[0]?.costUsd).toBeGreaterThan(0);
    expect(records[0]?.byok).toBe(false);
  });
});
