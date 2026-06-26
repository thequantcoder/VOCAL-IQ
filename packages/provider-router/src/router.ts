import { Capability, Provider, ProviderError } from '@vocaliq/shared';
import { AnthropicLLM } from './adapters/anthropic.js';
import { OpenAILLM } from './adapters/openai.js';
import type {
  CompletionOptions,
  CompletionResult,
  KeyResolver,
  LLMMessage,
  LLMProvider,
  RouteRequest,
  STTProvider,
  TTSProvider,
  UsageMeter,
} from './index.js';
import { llmCostUsd, sttCostUsd, telephonyCostUsd, ttsCostUsd } from './pricing.js';

/** Factory building a media (TTS/STT) adapter from a resolved key. */
export type MediaFactory<T> = (apiKey: string) => T;

/** Build a concrete LLM adapter for a provider from a resolved key. Injectable for tests. */
export type LLMFactory = (apiKey: string) => LLMProvider;

export interface RouterConfig {
  /** Resolves BYOK vs platform key for a (tenant, provider). */
  resolveKey: KeyResolver;
  /** Emits a UsageRecord for every metered call. */
  meter: UsageMeter;
  /** Per-provider LLM adapter factories (defaults to the real OpenAI/Anthropic adapters). */
  factories?: Partial<Record<Provider, LLMFactory>>;
  /** Default provider preference order for LLM routing. */
  llmOrder?: Provider[];
  /** TTS/STT adapter factories + preference orders (Day 07). */
  ttsFactories?: Partial<Record<Provider, MediaFactory<TTSProvider>>>;
  ttsOrder?: Provider[];
  sttFactories?: Partial<Record<Provider, MediaFactory<STTProvider>>>;
  sttOrder?: Provider[];
}

/** Measured units for a metered media call. */
export interface MediaUsage {
  provider: Provider;
  capability: Capability;
  /** Provider-native units: TTS characters, STT/telephony seconds. */
  units: number;
  byok: boolean;
  /** Model (TTS/STT) or provider key (telephony) for the price lookup. */
  priceKey: string;
}

function defaultFactories(): Partial<Record<Provider, LLMFactory>> {
  return {
    [Provider.OPENAI]: (k) => new OpenAILLM(k),
    [Provider.ANTHROPIC]: (k) => new AnthropicLLM(k),
  };
}

/** Map a model id to its provider so a tenant model preference picks the right adapter. */
function providerForModel(model: string | undefined): Provider | undefined {
  if (!model) return undefined;
  if (model.startsWith('claude')) return Provider.ANTHROPIC;
  if (model.startsWith('gpt') || model.startsWith('text-embedding')) return Provider.OPENAI;
  return undefined;
}

/**
 * The Provider Router (golden rule #2). `selectLLM` returns a routed client that:
 *  - picks a provider by tenant model preference → default order,
 *  - resolves BYOK vs platform key per provider,
 *  - falls back to the next provider on failure (no provider outage takes down a call),
 *  - emits a UsageRecord on every completion (BYOK recorded but not billed → golden rule #4).
 */
export class Router {
  private readonly factories: Partial<Record<Provider, LLMFactory>>;
  private readonly llmOrder: Provider[];

  constructor(private readonly config: RouterConfig) {
    this.factories = { ...defaultFactories(), ...config.factories };
    this.llmOrder = config.llmOrder ?? [Provider.OPENAI, Provider.ANTHROPIC];
  }

  /** Ordered candidate providers + the model to request from each. */
  private candidates(req: RouteRequest): { provider: Provider; model?: string }[] {
    const preferred = providerForModel(req.model);
    const order = preferred
      ? [preferred, ...this.llmOrder.filter((p) => p !== preferred)]
      : [...this.llmOrder];
    return order
      .filter((p) => this.factories[p])
      .map((p) => ({ provider: p, ...(p === preferred && req.model ? { model: req.model } : {}) }));
  }

  selectLLM(req: RouteRequest): RoutedLLM {
    const candidates = this.candidates(req);
    if (candidates.length === 0) throw new ProviderError('No LLM provider configured');
    return new RoutedLLM(
      candidates,
      req,
      this.factories,
      this.config.resolveKey,
      this.config.meter,
    );
  }

  /**
   * Pick the first media (TTS/STT) provider whose key resolves — selection-time
   * fallback so a provider with no key/credential is skipped. Mid-stream fallback
   * for live media is handled in the voice loop (Day 9).
   */
  private async selectMedia<T>(
    order: Provider[],
    factories: Partial<Record<Provider, MediaFactory<T>>>,
    req: RouteRequest,
    label: string,
  ): Promise<T> {
    let lastError: unknown;
    for (const provider of order) {
      const factory = factories[provider];
      if (!factory) continue;
      try {
        const { apiKey } = await this.config.resolveKey(req.tenantId, provider, req.byok);
        return factory(apiKey);
      } catch (error) {
        lastError = error;
      }
    }
    throw new ProviderError(`No ${label} provider available`, { cause: lastError });
  }

  selectTTS(req: RouteRequest): Promise<TTSProvider> {
    return this.selectMedia(
      this.config.ttsOrder ?? [Provider.ELEVENLABS],
      this.config.ttsFactories ?? {},
      req,
      'TTS',
    );
  }

  selectSTT(req: RouteRequest): Promise<STTProvider> {
    return this.selectMedia(
      this.config.sttOrder ?? [Provider.DEEPGRAM],
      this.config.sttFactories ?? {},
      req,
      'STT',
    );
  }

  /**
   * Emit a UsageRecord for a metered media call once its units are known
   * (TTS chars / STT+telephony seconds). The voice loop calls this per segment.
   */
  async meterMedia(usage: MediaUsage): Promise<void> {
    let costUsd = 0;
    if (usage.capability === Capability.TTS) costUsd = ttsCostUsd(usage.priceKey, usage.units);
    else if (usage.capability === Capability.STT) costUsd = sttCostUsd(usage.priceKey, usage.units);
    else if (usage.capability === Capability.TELEPHONY)
      costUsd = telephonyCostUsd(usage.priceKey, usage.units);
    await this.config.meter({
      provider: usage.provider,
      units: usage.units,
      costUsd,
      byok: usage.byok,
    });
  }
}

/**
 * A routed, metered LLM client. `complete` tries each candidate in order; the first
 * success meters usage and returns. BYOK cost is still computed (informational) but
 * flagged so billing excludes it.
 */
export class RoutedLLM {
  constructor(
    private readonly candidates: { provider: Provider; model?: string }[],
    private readonly req: RouteRequest,
    private readonly factories: Partial<Record<Provider, LLMFactory>>,
    private readonly resolveKey: KeyResolver,
    private readonly meter: UsageMeter,
  ) {}

  async complete(messages: LLMMessage[], opts?: CompletionOptions): Promise<CompletionResult> {
    let lastError: unknown;
    for (const candidate of this.candidates) {
      const factory = this.factories[candidate.provider];
      if (!factory) continue;
      try {
        const { apiKey, byok } = await this.resolveKey(
          this.req.tenantId,
          candidate.provider,
          this.req.byok,
        );
        const client = factory(apiKey);
        const result = await client.complete(messages, {
          ...opts,
          ...(candidate.model ? { model: candidate.model } : {}),
        });
        const units = result.usage.inputTokens + result.usage.outputTokens;
        const costUsd = llmCostUsd(
          result.model,
          result.usage.inputTokens,
          result.usage.outputTokens,
        );
        await this.meter({ provider: candidate.provider, units, costUsd, byok });
        return result;
      } catch (error) {
        lastError = error;
        // fall through to the next provider
      }
    }
    throw new ProviderError('All LLM providers failed', { cause: lastError });
  }

  /**
   * Stream from the first available provider. Token-level cost metering for streams
   * is wired with the live call loop (Day 9), where usage is metered per segment;
   * here the stream passes through after key resolution.
   */
  async *stream(messages: LLMMessage[], opts?: CompletionOptions): AsyncIterable<string> {
    const first = this.candidates[0];
    const factory = first ? this.factories[first.provider] : undefined;
    if (!first || !factory) throw new ProviderError('No LLM provider available to stream');
    const { apiKey } = await this.resolveKey(this.req.tenantId, first.provider, this.req.byok);
    const client = factory(apiKey);
    yield* client.stream(messages, {
      ...opts,
      ...(first.model ? { model: first.model } : {}),
    });
  }
}
