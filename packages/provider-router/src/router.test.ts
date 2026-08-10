import { Provider, type UsageRecord, isAppError } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import type {
  CompletionResult,
  KeyResolver,
  LLMFactory,
  LLMProvider,
  UsageMeter,
} from './index.js';
import { Router } from './router.js';

type MeterArg = Omit<UsageRecord, 'tenantId' | 'capability' | 'ts'>;

/** A fake LLM adapter so router selection/fallback/metering are tested without network. */
function fakeLLM(
  provider: Provider,
  opts: { fail?: boolean; model?: string; tokens?: [number, number] } = {},
): LLMProvider {
  return {
    provider,
    capability: 'llm',
    defaultModel: opts.model ?? 'gpt-4o-mini',
    async complete(): Promise<CompletionResult> {
      if (opts.fail) throw new Error('upstream boom');
      const [inT, outT] = opts.tokens ?? [10, 5];
      return {
        text: 'hello',
        model: opts.model ?? 'gpt-4o-mini',
        usage: { inputTokens: inT, outputTokens: outT },
      };
    },
    async *stream() {
      yield 'he';
      yield 'llo';
    },
    async embed() {
      return [[0.1, 0.2]];
    },
  };
}

function makeRouter(
  factories: Partial<Record<Provider, LLMFactory>>,
  byok = false,
): { router: Router; meter: ReturnType<typeof vi.fn>; resolveKey: ReturnType<typeof vi.fn> } {
  const meter = vi.fn<UsageMeter>(async () => {});
  const resolveKey = vi.fn<KeyResolver>(async () => ({ apiKey: 'test-key', byok }));
  const router = new Router({ resolveKey, meter, factories });
  return { router, meter, resolveKey };
}

describe('Router.selectLLM', () => {
  it('uses the default provider order (OpenAI first) and meters the call', async () => {
    const { router, meter } = makeRouter({
      [Provider.OPENAI]: () => fakeLLM(Provider.OPENAI),
      [Provider.ANTHROPIC]: () => fakeLLM(Provider.ANTHROPIC),
    });
    const res = await router
      .selectLLM({ tenantId: 't1', capability: 'llm' })
      .complete([{ role: 'user', content: 'hi' }]);
    expect(res.text).toBe('hello');
    expect(meter).toHaveBeenCalledTimes(1);
    const arg = meter.mock.calls[0]?.[0] as MeterArg;
    expect(arg.provider).toBe(Provider.OPENAI);
    expect(arg.units).toBe(15);
    expect(arg.costUsd).toBeCloseTo((10 * 0.15 + 5 * 0.6) / 1_000_000, 12);
    expect(arg.byok).toBe(false);
  });

  it('honours a tenant model preference (claude → Anthropic)', async () => {
    const { router, meter } = makeRouter({
      [Provider.OPENAI]: () => fakeLLM(Provider.OPENAI),
      [Provider.ANTHROPIC]: () =>
        fakeLLM(Provider.ANTHROPIC, { model: 'claude-opus-4-8', tokens: [100, 50] }),
    });
    await router
      .selectLLM({ tenantId: 't1', capability: 'llm', model: 'claude-opus-4-8' })
      .complete([{ role: 'user', content: 'hi' }]);
    const arg = meter.mock.calls[0]?.[0] as MeterArg;
    expect(arg.provider).toBe(Provider.ANTHROPIC);
    expect(arg.costUsd).toBeCloseTo((100 * 5 + 50 * 25) / 1_000_000, 12);
  });

  it('falls back to the next provider when the primary fails', async () => {
    const { router, meter } = makeRouter({
      [Provider.OPENAI]: () => fakeLLM(Provider.OPENAI, { fail: true }),
      [Provider.ANTHROPIC]: () => fakeLLM(Provider.ANTHROPIC, { model: 'claude-haiku-4-5' }),
    });
    const res = await router
      .selectLLM({ tenantId: 't1', capability: 'llm' })
      .complete([{ role: 'user', content: 'hi' }]);
    expect(res.model).toBe('claude-haiku-4-5');
    expect(meter.mock.calls[0]?.[0] as MeterArg).toMatchObject({ provider: Provider.ANTHROPIC });
  });

  it('records BYOK usage informationally but flags it (not billed)', async () => {
    const { router, meter } = makeRouter(
      { [Provider.OPENAI]: () => fakeLLM(Provider.OPENAI) },
      true,
    );
    await router
      .selectLLM({ tenantId: 't1', capability: 'llm', byok: true })
      .complete([{ role: 'user', content: 'hi' }]);
    const arg = meter.mock.calls[0]?.[0] as MeterArg;
    expect(arg.byok).toBe(true);
    expect(arg.costUsd).toBeGreaterThan(0); // cost still computed for visibility
  });

  it('throws a ProviderError when every provider fails', async () => {
    const { router } = makeRouter({
      [Provider.OPENAI]: () => fakeLLM(Provider.OPENAI, { fail: true }),
      [Provider.ANTHROPIC]: () => fakeLLM(Provider.ANTHROPIC, { fail: true }),
    });
    await expect(
      router
        .selectLLM({ tenantId: 't1', capability: 'llm' })
        .complete([{ role: 'user', content: 'hi' }]),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');
  });
});
