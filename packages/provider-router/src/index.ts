import type { Capability, Provider, UsageRecord } from '@vocaliq/shared';

/**
 * @vocaliq/provider-router — the abstraction that protects margin (golden rule #2).
 * ALL LLM/TTS/STT/telephony calls go through here; every call emits a UsageRecord
 * (golden rule #4). Adding a provider is a config change, not a rewrite.
 */

export * from './pricing.js';
export * from './router.js';
export { OpenAILLM } from './adapters/openai.js';
export { AnthropicLLM } from './adapters/anthropic.js';

// ── Typed message + completion contracts ──────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  /** Override the adapter's default model. */
  model?: string;
  maxTokens?: number;
  /** System prompt (kept separate so each provider maps it natively). */
  system?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult {
  text: string;
  /** The concrete model that actually served the request. */
  model: string;
  usage: TokenUsage;
}

/**
 * One LLM provider adapter. Concrete adapters (OpenAI, Anthropic, …) implement this;
 * the Router selects + wraps one with cost metering. Embeddings are optional —
 * providers without them throw a typed ProviderError.
 */
export interface LLMProvider {
  readonly provider: Provider;
  readonly capability: Extract<Capability, 'llm'>;
  /** Default model when CompletionOptions.model is not set. */
  readonly defaultModel: string;
  complete(messages: LLMMessage[], opts?: CompletionOptions): Promise<CompletionResult>;
  stream(messages: LLMMessage[], opts?: CompletionOptions): AsyncIterable<string>;
  embed(input: string | string[], opts?: { model?: string }): Promise<number[][]>;
}

// ── Routing inputs + the usage meter ──────────────────────────────────────────

/** Inputs the Router uses to select a concrete provider for a capability. */
export interface RouteRequest {
  tenantId: string;
  agentId?: string;
  capability: Capability;
  language?: string;
  /** Preferred concrete model (tenant/agent policy); falls back per availability. */
  model?: string;
  costCeiling?: number;
  latencyTarget?: number;
  /** true = tenant brings their own key (BYOK) — recorded but not billed. */
  byok?: boolean;
}

/**
 * Records usage for cost attribution. The Router fills in tenantId/capability/ts;
 * the adapter supplies provider/units/costUsd/byok (CODE-PATTERNS §2/§3).
 */
export type UsageMeter = (
  record: Omit<UsageRecord, 'tenantId' | 'capability' | 'ts'>,
) => Promise<void>;

/**
 * Resolves the API key for a (tenant, provider) — BYOK from the tenant's stored
 * ProviderCredential, else the platform key. Envelope decryption is injected so
 * the router never touches KMS directly (CODE-PATTERNS §5).
 */
export type KeyResolver = (
  tenantId: string,
  provider: Provider,
  preferByok?: boolean,
) => Promise<ResolvedKey>;

export interface ResolvedKey {
  apiKey: string;
  /** true → BYOK: usage is recorded informationally but NOT billed. */
  byok: boolean;
}

// ── Other capability contracts (skeletons; concrete adapters land Days 7–12) ───

export interface TTSProvider {
  readonly provider: Provider;
  synthesizeStream(text: string, opts?: unknown): AsyncIterable<Uint8Array>;
}

export interface STTProvider {
  readonly provider: Provider;
  transcribeStream(audio: AsyncIterable<Uint8Array>, opts?: unknown): AsyncIterable<unknown>;
}

export interface TelephonyProvider {
  readonly provider: Provider;
  dial(to: string, from: string, opts?: unknown): Promise<unknown>;
  answer(callId: string): Promise<unknown>;
  transfer(callId: string, to: string): Promise<unknown>;
  hangup(callId: string): Promise<void>;
}
