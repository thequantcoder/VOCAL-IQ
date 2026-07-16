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
export { ElevenLabsTTS } from './adapters/elevenlabs.js';
export { DeepgramSTT } from './adapters/deepgram.js';
export { TwilioTelephony, TwilioNumberProvisioner } from './adapters/twilio.js';
export { TelnyxTelephony, TelnyxNumberProvisioner } from './adapters/telnyx.js';
export { PlivoTelephony, PlivoNumberProvisioner } from './adapters/plivo.js';
export {
  WhatsAppCallingTelephony,
  whatsappErrorCode,
  WHATSAPP_NO_PERMISSION_CODE,
  WHATSAPP_GRAPH_VERSION,
  type WaCallPermission,
  type WaPlaceCallInput,
  type WaSession,
} from './adapters/whatsapp-calling.js';
export { OpenRouterLLM } from './adapters/openrouter.js';
export { LiveKitMedia } from './adapters/livekit.js';

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
  /** Set when the key came from the load-balanced platform pool (Day 38) — its id, so the
   *  caller can report the call outcome for key health/ejection tracking. */
  poolKeyId?: string;
}

// ── TTS / STT / Telephony / media contracts ───────────────────────────────────
//
// Day 07 ships the typed contracts, price tables, router selection/fallback, and
// the Python mirror. The concrete adapter BODIES (ElevenLabs/Deepgram/Twilio/
// LiveKit) + live sandbox smokes land once the provider keys are set — until then
// the adapters are stubs that throw a typed "not implemented" ProviderError.

export interface TTSOptions {
  model?: string;
  voiceId?: string;
  language?: string;
  /** Provider voice settings (stability, similarity, pace, …). */
  settings?: Record<string, unknown>;
}

/** Streaming TTS. Cost is metered on input characters (`text.length`). */
export interface TTSProvider {
  readonly provider: Provider;
  readonly capability: Extract<Capability, 'tts'>;
  readonly defaultModel: string;
  synthesizeStream(text: string, opts?: TTSOptions): AsyncIterable<Uint8Array>;
}

export interface STTOptions {
  model?: string;
  language?: string;
  /** Emit interim (partial) transcripts as audio streams in. */
  interimResults?: boolean;
  /** Custom vocabulary to boost recognition of brand/drug/SKU terms (Day 39). */
  keyterms?: string[];
}

export interface STTEvent {
  transcript: string;
  isFinal: boolean;
}

/** Streaming STT. Cost is metered on audio seconds (known when the stream ends). */
export interface STTProvider {
  readonly provider: Provider;
  readonly capability: Extract<Capability, 'stt'>;
  readonly defaultModel: string;
  transcribeStream(audio: AsyncIterable<Uint8Array>, opts?: STTOptions): AsyncIterable<STTEvent>;
}

export interface DialResult {
  callId: string;
  status: string;
}

/** Telephony (PSTN/SIP). Cost is metered on call minutes (known at hangup). */
export interface TelephonyProvider {
  readonly provider: Provider;
  readonly capability: Extract<Capability, 'telephony'>;
  dial(to: string, from: string, opts?: Record<string, unknown>): Promise<DialResult>;
  answer(callId: string): Promise<void>;
  transfer(callId: string, to: string): Promise<void>;
  hangup(callId: string): Promise<void>;
}

/** Real-time media room (WebRTC). Token mints a client join credential. */
export interface MediaProvider {
  readonly provider: Provider;
  createRoom(name: string): Promise<{ room: string }>;
  token(room: string, identity: string): Promise<string>;
}

// ── Number provisioning ────────────────────────────────────────────────────────

/** A number available to purchase at a carrier (search result). */
export interface AvailableNumber {
  e164: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  country: string;
  /** 'VOICE' | 'SMS' | 'MMS'. */
  capabilities: string[];
  /** Estimated recurring monthly cost, USD (carriers don't always return this in search). */
  monthlyCostUsd: number;
}

export interface NumberSearchParams {
  country: string;
  areaCode?: string;
  contains?: string;
  smsEnabled?: boolean;
  voiceEnabled?: boolean;
  limit: number;
}

/** A number just purchased at the carrier (the provider SID lets us release it later). */
export interface PurchasedNumber {
  providerSid: string;
  e164: string;
  capabilities: string[];
}

/**
 * Phone-number provisioning at a carrier (search / buy / release). Kept behind this abstraction so a
 * new carrier (Telnyx, Vonage, …) is a config change, not a rewrite (golden rule #2). Cost is metered
 * by the caller (golden rule #4) — the adapter never bills.
 */
export interface NumberProvisioner {
  readonly provider: Provider;
  searchAvailable(params: NumberSearchParams): Promise<AvailableNumber[]>;
  purchase(e164: string): Promise<PurchasedNumber>;
  release(providerSid: string): Promise<void>;
}
