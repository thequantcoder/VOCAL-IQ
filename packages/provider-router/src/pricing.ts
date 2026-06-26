/**
 * Provider price tables (USD per 1M tokens). The source of truth for per-call cost
 * attribution (golden rule #4). Prices change — re-verify against each provider's
 * pricing page before relying on margins (CLAUDE.md §13/§15). Anthropic figures are
 * from the claude-api reference (Opus 4.8 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5).
 */

export interface ModelPrice {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
}

export const LLM_PRICES: Readonly<Record<string, ModelPrice>> = {
  // Anthropic
  'claude-opus-4-8': { inputPerM: 5, outputPerM: 25 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
  // OpenAI (re-verify periodically)
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
};

/** USD per 1M tokens for embedding models. */
export const EMBEDDING_PRICES: Readonly<Record<string, number>> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
};

/** TTS: USD per 1,000 input characters (re-verify per provider plan). */
export const TTS_PRICES: Readonly<Record<string, number>> = {
  eleven_turbo_v2_5: 0.15,
  eleven_multilingual_v2: 0.3,
};

/** STT: USD per audio minute. */
export const STT_PRICES: Readonly<Record<string, number>> = {
  'nova-2': 0.0043,
  'nova-3': 0.0043,
};

/** Telephony: USD per call minute (varies by destination; this is a US-default). */
export const TELEPHONY_PRICES: Readonly<Record<string, number>> = {
  twilio: 0.014,
  telnyx: 0.01,
};

/**
 * Resolve a price for a model id, tolerating provider date suffixes
 * (e.g. `gpt-4o-mini-2024-07-18` → `gpt-4o-mini`). Exact match wins; otherwise the
 * LONGEST table key that is a dash-prefix of the model (so `gpt-4o-mini-…` never
 * matches the shorter `gpt-4o`).
 */
export function resolveModelPrice(model: string): ModelPrice | undefined {
  if (LLM_PRICES[model]) return LLM_PRICES[model];
  let best: { key: string; price: ModelPrice } | undefined;
  for (const [key, price] of Object.entries(LLM_PRICES)) {
    if (model.startsWith(`${key}-`) && (!best || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price;
}

/** Per-call LLM cost from the versioned price table. Unknown model → 0 (logged upstream). */
export function llmCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = resolveModelPrice(model);
  if (!price) return 0;
  return (inputTokens * price.inputPerM + outputTokens * price.outputPerM) / 1_000_000;
}

/** Per-call embedding cost. */
export function embeddingCostUsd(model: string, tokens: number): number {
  const perM = EMBEDDING_PRICES[model];
  if (perM === undefined) return 0;
  return (tokens * perM) / 1_000_000;
}

/** TTS cost from input characters. */
export function ttsCostUsd(model: string, characters: number): number {
  const per1k = TTS_PRICES[model];
  if (per1k === undefined) return 0;
  return (characters / 1_000) * per1k;
}

/** STT cost from audio seconds (priced per minute). */
export function sttCostUsd(model: string, audioSeconds: number): number {
  const perMin = STT_PRICES[model];
  if (perMin === undefined) return 0;
  return (audioSeconds / 60) * perMin;
}

/** Telephony cost from call seconds (priced per minute), keyed by provider id. */
export function telephonyCostUsd(providerKey: string, callSeconds: number): number {
  const perMin = TELEPHONY_PRICES[providerKey];
  if (perMin === undefined) return 0;
  return (callSeconds / 60) * perMin;
}
