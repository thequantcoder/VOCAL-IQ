import { z } from 'zod';

/**
 * Voice library + tuning + gated cloning (Day 26). A voice is either a public preset
 * (tenantId = null, visible to all) or a tenant-private voice — including a cloned voice
 * that stays UNUSABLE until an operator approves it (consent gate, self-audit C). These
 * pure helpers keep the settings shape, filters, and the usability rule deterministic +
 * tested; the API layer persists them and the loop resolves them per-language (Day 25).
 */

// ── Tuning sliders ────────────────────────────────────────────────────────────

/**
 * Normalised 0..1 tuning knobs shared across TTS providers. `stability` + `similarity`
 * map to ElevenLabs directly; `pace`/`pitch`/`style` are provider-adapted (some providers
 * ignore what they can't do). Kept as a flat, clamped shape so the UI sliders round-trip.
 */
export const voiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1).default(0.5),
  similarity: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0),
  pace: z.number().min(0.5).max(2).default(1), // 1 = natural; <1 slower, >1 faster
  pitch: z.number().min(-1).max(1).default(0), // semitone-ish, 0 = natural
});
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

/** Parse partial/unknown settings into a full, clamped VoiceSettings (never throws). */
export function normalizeVoiceSettings(input: unknown): VoiceSettings {
  return voiceSettingsSchema.parse(input ?? {});
}

// ── Library filters ───────────────────────────────────────────────────────────

export const VOICE_GENDERS = ['male', 'female', 'neutral'] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const voiceFilterSchema = z.object({
  language: z.string().min(2).max(10).optional(),
  gender: z.enum(VOICE_GENDERS).optional(),
  age: z.string().max(20).optional(), // young / middle-aged / old
  accent: z.string().max(40).optional(),
  style: z.string().max(40).optional(),
  includeCloned: z.boolean().default(true),
});
export type VoiceFilter = z.infer<typeof voiceFilterSchema>;

// ── Usability (the consent/approval gate) ─────────────────────────────────────

/**
 * A voice is usable on a call unless it is a clone that has NOT been approved yet.
 * Presets and approved clones pass; a fresh clone is blocked until an operator signs off
 * (Day 26 DoD: "unapproved clones unusable"). This single predicate is enforced on every
 * assignment + at resolve time so there is no path around the gate.
 */
export function isVoiceUsable(voice: { isCloned: boolean; approved: boolean }): boolean {
  return !voice.isCloned || voice.approved;
}

/** Coarse shape of a library row the filters run against (matches the DB projection). */
export interface VoiceView {
  id: string;
  provider: string;
  providerVoiceId: string;
  name: string;
  language: string | null;
  gender: string | null;
  age: string | null;
  accent: string | null;
  style: string | null;
  isCloned: boolean;
  approved: boolean;
  isPreset: boolean; // tenantId === null
}

/** Apply library filters in-memory (RLS already scoped the rows to preset + this tenant). */
export function filterVoices(voices: VoiceView[], filter: VoiceFilter): VoiceView[] {
  return voices.filter((v) => {
    if (filter.language && v.language !== filter.language) return false;
    if (filter.gender && v.gender !== filter.gender) return false;
    if (filter.age && v.age !== filter.age) return false;
    if (filter.accent && v.accent !== filter.accent) return false;
    if (filter.style && v.style !== filter.style) return false;
    if (!filter.includeCloned && v.isCloned) return false;
    return true;
  });
}

// ── Consent capture (cloning) ─────────────────────────────────────────────────

/**
 * Mandatory consent record captured before a clone is created. `consentGiven` MUST be
 * true; the subject's name + a dated consent statement are stored on the Voice
 * (`consentRef`) so the clone is auditable (self-audit C + K). No consent → no clone.
 */
export const cloneConsentSchema = z.object({
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: 'Explicit consent is required to clone a voice' }),
  }),
  subjectName: z.string().min(1).max(120),
  statement: z.string().min(1).max(1000),
  consentedAt: z.string().datetime().optional(), // stamped server-side if absent
});
export type CloneConsent = z.infer<typeof cloneConsentSchema>;

export const cloneRequestSchema = z.object({
  name: z.string().min(1).max(120),
  language: z.string().min(2).max(10).optional(),
  gender: z.enum(VOICE_GENDERS).optional(),
  sampleUrls: z.array(z.string().url()).min(1).max(25),
  consent: cloneConsentSchema,
});
export type CloneRequest = z.infer<typeof cloneRequestSchema>;

// ── Preset catalogue ──────────────────────────────────────────────────────────

/** A public preset voice (ElevenLabs stock voices validated on Day 07). */
export interface VoicePreset {
  providerVoiceId: string;
  name: string;
  gender: VoiceGender;
  age: string;
  accent: string;
  style: string;
  language: string;
}

/**
 * Seed presets so a fresh tenant has a usable library on Day 1. These are ElevenLabs
 * stock voice IDs (stable, public). The DB is seeded from this list (tenantId = null).
 */
export const VOICE_PRESETS: readonly VoicePreset[] = [
  {
    providerVoiceId: 'CwhRBWXzGAHq8TQ4Fs17',
    name: 'Roger',
    gender: 'male',
    age: 'middle-aged',
    accent: 'american',
    style: 'conversational',
    language: 'en',
  },
  {
    providerVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    gender: 'female',
    age: 'young',
    accent: 'american',
    style: 'professional',
    language: 'en',
  },
  {
    providerVoiceId: 'FGY2WhTYpPnrIDTdsKH5',
    name: 'Laura',
    gender: 'female',
    age: 'young',
    accent: 'american',
    style: 'upbeat',
    language: 'en',
  },
  {
    providerVoiceId: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie',
    gender: 'male',
    age: 'middle-aged',
    accent: 'australian',
    style: 'casual',
    language: 'en',
  },
  {
    providerVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George',
    gender: 'male',
    age: 'middle-aged',
    accent: 'british',
    style: 'warm',
    language: 'en',
  },
  {
    providerVoiceId: 'XB0fDUnXU5powFXDhCwa',
    name: 'Charlotte',
    gender: 'female',
    age: 'young',
    accent: 'swedish',
    style: 'seductive',
    language: 'en',
  },
  {
    providerVoiceId: 'pqHfZKP75CvOlQylNhV4',
    name: 'Bill',
    gender: 'male',
    age: 'old',
    accent: 'american',
    style: 'trustworthy',
    language: 'en',
  },
  {
    providerVoiceId: 'cgSgspJ2msm6clMCkdW9',
    name: 'Jessica',
    gender: 'female',
    age: 'young',
    accent: 'american',
    style: 'expressive',
    language: 'en',
  },
] as const;
