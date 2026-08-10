import { describe, expect, it } from 'vitest';
import {
  embeddingCostUsd,
  llmCostUsd,
  sttCostUsd,
  telephonyCostUsd,
  ttsCostUsd,
} from './pricing.js';

describe('pricing', () => {
  it('computes LLM cost from input/output token prices', () => {
    // gpt-4o-mini: $0.15/$0.60 per 1M → 10 in + 5 out
    expect(llmCostUsd('gpt-4o-mini', 10, 5)).toBeCloseTo((10 * 0.15 + 5 * 0.6) / 1_000_000, 12);
    // claude-opus-4-8: $5/$25 per 1M
    expect(llmCostUsd('claude-opus-4-8', 1000, 1000)).toBeCloseTo(
      (1000 * 5 + 1000 * 25) / 1_000_000,
      12,
    );
  });

  it('returns 0 for unknown models (no silent overcharge)', () => {
    expect(llmCostUsd('mystery-model', 100, 100)).toBe(0);
    expect(embeddingCostUsd('mystery-embed', 100)).toBe(0);
  });

  it('computes embedding cost', () => {
    expect(embeddingCostUsd('text-embedding-3-small', 1_000_000)).toBeCloseTo(0.02, 10);
  });

  it('computes media costs (TTS chars, STT/telephony seconds) and 0 for unknown', () => {
    // TTS: $0.15 per 1k chars
    expect(ttsCostUsd('eleven_turbo_v2_5', 1_000)).toBeCloseTo(0.15, 10);
    expect(ttsCostUsd('mystery-voice', 1_000)).toBe(0);
    // STT: $0.0043 per minute → 60s = 1 min
    expect(sttCostUsd('nova-3', 60)).toBeCloseTo(0.0043, 10);
    expect(sttCostUsd('mystery-stt', 60)).toBe(0);
    // Telephony: $0.014 per minute → 120s = 2 min
    expect(telephonyCostUsd('twilio', 120)).toBeCloseTo(0.028, 10);
    expect(telephonyCostUsd('mystery-telco', 60)).toBe(0);
  });
});
