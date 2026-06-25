import type { Capability, UsageRecord } from '@vocaliq/shared';

/**
 * @vocaliq/provider-router — the abstraction that protects margin (golden rule #2).
 * ALL LLM/TTS/STT/telephony calls go through here; every call emits a UsageRecord.
 * Day 0 defines the typed contract; concrete adapters + the Router land on Days 6–7
 * (and a Python mirror in apps/voice).
 */

/** Inputs the Router uses to select a concrete provider for a capability. */
export interface RouteRequest {
  tenantId: string;
  agentId?: string;
  capability: Capability;
  language?: string;
  costCeiling?: number;
  latencyTarget?: number;
  /** true = tenant brings their own key (BYOK) — recorded but not billed. */
  byok?: boolean;
}

/** Callback that records usage for cost attribution. */
export type UsageMeter = (
  record: Omit<UsageRecord, 'tenantId' | 'capability' | 'ts'>,
) => Promise<void>;

export interface LLMProvider {
  readonly name: string;
  complete(messages: unknown[], opts?: unknown): Promise<unknown>;
  stream(messages: unknown[], opts?: unknown): AsyncIterable<unknown>;
  embed(input: string | string[]): Promise<number[][]>;
}

export interface TTSProvider {
  readonly name: string;
  synthesizeStream(text: string, opts?: unknown): AsyncIterable<Uint8Array>;
}

export interface STTProvider {
  readonly name: string;
  transcribeStream(audio: AsyncIterable<Uint8Array>, opts?: unknown): AsyncIterable<unknown>;
}

export interface TelephonyProvider {
  readonly name: string;
  dial(to: string, from: string, opts?: unknown): Promise<unknown>;
  answer(callId: string): Promise<unknown>;
  transfer(callId: string, to: string): Promise<unknown>;
  hangup(callId: string): Promise<void>;
}
