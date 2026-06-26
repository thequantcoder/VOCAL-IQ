import { Capability, type Provider } from './enums.js';

/**
 * UsageRecord — emitted on EVERY provider call for cost attribution
 * (golden rule #4, CODE-PATTERNS §2/§3). One record per metered call;
 * a reconciliation worker must find zero calls without records.
 */
export interface UsageRecord {
  tenantId: string;
  callId?: string;
  provider: Provider;
  capability: Capability;
  /** Provider-native units (tokens, characters, seconds, etc.). */
  units: number;
  /** Computed from the versioned price table at call time. */
  costUsd: number;
  /** BYOK usage is recorded informationally but NOT billed. */
  byok: boolean;
  ts: Date;
}

/** Per-call cost rollup stored on Call.costBreakdown (DATA-MODEL Call). */
export interface CostBreakdown {
  stt: number;
  llm: number;
  tts: number;
  telephony: number;
  total: number;
}

/** A fresh, zeroed breakdown to accumulate into. */
export function emptyCostBreakdown(): CostBreakdown {
  return { stt: 0, llm: 0, tts: 0, telephony: 0, total: 0 };
}

/** Which breakdown bucket a capability's cost lands in (embeddings fold into llm). */
const CAPABILITY_BUCKET: Record<Capability, keyof Omit<CostBreakdown, 'total'>> = {
  [Capability.STT]: 'stt',
  [Capability.LLM]: 'llm',
  [Capability.EMBEDDING]: 'llm',
  [Capability.TTS]: 'tts',
  [Capability.TELEPHONY]: 'telephony',
};

/**
 * Add a metered cost into a breakdown (pure — returns a new object). Keeps `total`
 * consistent so the per-call rollup always equals the sum of its parts.
 */
export function addCost(
  breakdown: CostBreakdown,
  capability: Capability,
  costUsd: number,
): CostBreakdown {
  const bucket = CAPABILITY_BUCKET[capability];
  return {
    ...breakdown,
    [bucket]: breakdown[bucket] + costUsd,
    total: breakdown.total + costUsd,
  };
}
