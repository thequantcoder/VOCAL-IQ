import type { Capability } from './enums.js';

/**
 * UsageRecord — emitted on EVERY provider call for cost attribution
 * (golden rule #4, CODE-PATTERNS §2/§3). One record per metered call;
 * a reconciliation worker must find zero calls without records.
 */
export interface UsageRecord {
  tenantId: string;
  callId?: string;
  provider: string;
  capability: Capability;
  /** Provider-native units (tokens, characters, seconds, etc.). */
  units: number;
  /** Computed from the versioned price table at call time. */
  costUsd: number;
  /** BYOK usage is recorded informationally but NOT billed. */
  byok: boolean;
  ts: Date;
}

/** Per-call cost rollup stored on Call.costBreakdown. */
export interface CostBreakdown {
  stt: number;
  llm: number;
  tts: number;
  telephony: number;
  total: number;
}
