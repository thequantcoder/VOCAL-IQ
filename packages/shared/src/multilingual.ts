import { z } from 'zod';

/**
 * Multilingual config + helpers (Day 25). An agent declares its languages, a default, and
 * optional per-language voices + a pronunciation dictionary (names/brands/jargon). The
 * loop auto-detects the caller's language mid-call (via the STT provider) and switches the
 * TTS voice + STT language accordingly; these pure helpers make that deterministic + tested.
 */

export const pronunciationSchema = z.object({
  term: z.string().min(1).max(80),
  say: z.string().min(1).max(120), // phonetic / spelled-out replacement
});
export type Pronunciation = z.infer<typeof pronunciationSchema>;

export const languageVoiceSchema = z.object({
  code: z.string().min(2).max(10), // BCP-47-ish, e.g. en / es / fr / hi
  voiceId: z.string().max(80).default(''),
  sttModel: z.string().max(40).default(''),
});
export type LanguageVoice = z.infer<typeof languageVoiceSchema>;

export const multilingualConfigSchema = z.object({
  languages: z.array(languageVoiceSchema).default([]),
  defaultLanguage: z.string().min(2).max(10).default('en'),
  autoDetect: z.boolean().default(true),
  pronunciations: z.array(pronunciationSchema).default([]),
});
export type MultilingualConfig = z.infer<typeof multilingualConfigSchema>;

/** Resolve the TTS voice for a language: exact match → default-language voice → null. */
export function resolveVoice(config: MultilingualConfig, lang: string): string | null {
  const exact = config.languages.find((l) => l.code === lang && l.voiceId);
  if (exact) return exact.voiceId;
  const fallback = config.languages.find((l) => l.code === config.defaultLanguage && l.voiceId);
  return fallback?.voiceId ?? null;
}

/** True if the agent is configured to speak this language (or auto-detect is on). */
export function supportsLanguage(config: MultilingualConfig, lang: string): boolean {
  return config.autoDetect || config.languages.some((l) => l.code === lang);
}

/**
 * Apply the pronunciation dictionary to text before TTS — replace each term (whole-word,
 * case-insensitive) with its spoken form. Longer terms first so multi-word entries win.
 */
export function applyPronunciations(text: string, entries: Pronunciation[]): string {
  let out = text;
  const sorted = [...entries].sort((a, b) => b.term.length - a.term.length);
  for (const { term, say } of sorted) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), say);
  }
  return out;
}

/**
 * Coarse script-based language hint (fallback when the STT provider gives no language).
 * Distinguishes scripts, not Latin languages — real detection comes from the provider.
 * Returns a language code or 'und' (undetermined, e.g. Latin script).
 */
export function detectScriptLanguage(text: string): string {
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja'; // hiragana/katakana
  if (/[가-힯]/.test(text)) return 'ko'; // hangul
  if (/[一-鿿]/.test(text)) return 'zh'; // han (assume zh if no kana)
  if (/[؀-ۿ]/.test(text)) return 'ar'; // arabic
  if (/[ऀ-ॿ]/.test(text)) return 'hi'; // devanagari
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'; // cyrillic
  return 'und';
}
