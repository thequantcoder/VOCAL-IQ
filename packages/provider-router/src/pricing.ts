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
 * WhatsApp Business Calling — OUTBOUND USD per minute by DESTINATION country, as `[tier0, tier1]`
 * where tier1 is the discounted rate for higher monthly volume. **Inbound (user-initiated) is FREE.**
 * Meta bills only answered calls, in 6-second pulses (rounded up), volume-tiered per calendar month.
 * ⚠️ PLACEHOLDER starter card — replace with Meta's official quarterly rate card (16 currencies) before
 * relying on margins (CLAUDE.md §15). Structure + math are correct; only the numbers need Meta's card.
 */
export const WHATSAPP_CALL_RATES: Readonly<Record<string, readonly [number, number]>> = {
  US: [0.01, 0.008],
  GB: [0.018, 0.015],
  IN: [0.006, 0.005],
  BR: [0.012, 0.01],
  ID: [0.008, 0.006],
  DEFAULT: [0.015, 0.012],
};

/** Monthly-volume tier boundary (minutes). Meta uses the LOWER rate once volume crosses the band. */
export const WHATSAPP_TIER0_MAX_MINUTES = 50_000;

/**
 * E.164 calling-code → ISO-2 prefixes for the destinations we rate-card (longest-prefix wins). Only the
 * countries with an explicit `WHATSAPP_CALL_RATES` entry need mapping — everything else falls to DEFAULT.
 * Ordered longest-first so `+1` (US) never shadows a longer code. ⚠️ Extend alongside the rate card.
 */
const WHATSAPP_DIAL_CODES: ReadonlyArray<readonly [string, string]> = [
  ['55', 'BR'],
  ['62', 'ID'],
  ['91', 'IN'],
  ['44', 'GB'],
  ['1', 'US'],
];

/**
 * Resolve the destination country (ISO-2) for a WhatsApp OUTBOUND call from the callee's E.164 number,
 * so we pick the right per-country rate. Unknown / unmapped / blank → `'DEFAULT'` (the fallback band).
 * This is a coarse rate-routing helper, NOT full number validation (that's the provider's job).
 */
export function whatsappDestinationCountry(e164: string): string {
  const digits = (e164 ?? '').replace(/[^\d]/g, '');
  if (!digits) return 'DEFAULT';
  for (const [code, iso] of WHATSAPP_DIAL_CODES) {
    if (digits.startsWith(code)) return iso;
  }
  return 'DEFAULT';
}

/** Number of billed 6-second pulses for a call of `seconds` (rounded up; 56 s → 10 pulses). */
export function whatsappCallPulses(seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.ceil(seconds / 6);
}

/** Per-minute WhatsApp rate for a destination country + monthly-minutes tier (tier1 once past the band). */
export function whatsappCallRatePerMin(country: string, monthlyMinutes = 0): number {
  const band = WHATSAPP_CALL_RATES[country.toUpperCase()] ?? WHATSAPP_CALL_RATES.DEFAULT;
  const [tier0, tier1] = band as readonly [number, number];
  return monthlyMinutes > WHATSAPP_TIER0_MAX_MINUTES ? tier1 : tier0;
}

/**
 * WhatsApp call carrier cost in USD. Inbound (user-initiated) is FREE (returns 0). Outbound is billed
 * in 6-second pulses (round up) at the destination country's per-minute rate for the current monthly
 * tier. `monthlyMinutes` = the tenant's (or platform's) accrued WhatsApp outbound minutes this month.
 */
export function whatsappCallCostUsd(
  seconds: number,
  country: string,
  direction: 'inbound' | 'outbound',
  monthlyMinutes = 0,
): number {
  if (direction === 'inbound' || seconds <= 0) return 0;
  const billedSeconds = whatsappCallPulses(seconds) * 6;
  return (billedSeconds / 60) * whatsappCallRatePerMin(country, monthlyMinutes);
}

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
