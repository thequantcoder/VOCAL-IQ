/**
 * India-first language + voice catalog (India roadmap Phase 2). The frontend agent builder + voice
 * picker read these; the voice loop routes an Indic-language call to Sarvam (Saaras+sarvam-30b+Bulbul)
 * when the agent's primary language is one of these. Codes are the base ISO-639 form the loop keys on.
 */

export interface IndianLanguage {
  /** Base code the routing keys on (e.g. 'hi'); Sarvam wants `<code>-IN` (handled voice-side). */
  code: string;
  /** English name. */
  label: string;
  /** Native-script name (shown in the picker). */
  native: string;
  /** True when Sarvam Bulbul TTS has a voice for it (else STT+LLM Indic, TTS falls back). */
  tts: boolean;
}

/** The 22 scheduled languages of India (+ Indian English). `tts` = Bulbul v3 voice available today. */
export const INDIAN_LANGUAGES: readonly IndianLanguage[] = [
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', tts: true },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', tts: true },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', tts: true },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', tts: true },
  { code: 'mr', label: 'Marathi', native: 'मराठी', tts: true },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', tts: true },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', tts: true },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', tts: true },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', tts: true },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ', tts: true },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া', tts: false },
  { code: 'ur', label: 'Urdu', native: 'اردو', tts: false },
  { code: 'sa', label: 'Sanskrit', native: 'संस्कृतम्', tts: false },
  { code: 'ks', label: 'Kashmiri', native: 'کٲشُر', tts: false },
  { code: 'sd', label: 'Sindhi', native: 'سنڌي', tts: false },
  { code: 'ne', label: 'Nepali', native: 'नेपाली', tts: false },
  { code: 'kok', label: 'Konkani', native: 'कोंकणी', tts: false },
  { code: 'mni', label: 'Manipuri', native: 'ꯃꯤꯇꯩ ꯂꯣꯟ', tts: false },
  { code: 'brx', label: 'Bodo', native: 'बड़ो', tts: false },
  { code: 'doi', label: 'Dogri', native: 'डोगरी', tts: false },
  { code: 'mai', label: 'Maithili', native: 'मैथिली', tts: false },
  { code: 'sat', label: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', tts: false },
] as const;

const INDIAN_CODES: ReadonlySet<string> = new Set(INDIAN_LANGUAGES.map((l) => l.code));

/** Base code of a language tag ('hi-IN' → 'hi'), lowercased. */
export function baseLanguageCode(tag: string | null | undefined): string {
  return (tag ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
}

/** True when `tag` (e.g. 'hi', 'hi-IN', 'ta') is one of India's scheduled languages. */
export function isIndianLanguage(tag: string | null | undefined): boolean {
  return INDIAN_CODES.has(baseLanguageCode(tag));
}

/** The agent's primary (first) language — what the call loop routes on. Empty array ⇒ undefined. */
export function primaryLanguage(
  languages: readonly string[] | null | undefined,
): string | undefined {
  return languages && languages.length > 0 ? languages[0] : undefined;
}

export type VoiceGenderLabel = 'female' | 'male';

export interface SarvamVoice {
  /** Bulbul speaker id (sent as `speaker`). */
  id: string;
  gender: VoiceGenderLabel;
}

/**
 * Sarvam Bulbul v3 speakers (39 voices) — the TTS voices for Indian-language agents. `shubh` is the
 * default (matches the voice adapter). Shown in the picker when the agent's primary language is Indic.
 */
export const SARVAM_VOICES: readonly SarvamVoice[] = [
  { id: 'shubh', gender: 'male' },
  { id: 'aditya', gender: 'male' },
  { id: 'advait', gender: 'male' },
  { id: 'aayan', gender: 'male' },
  { id: 'amit', gender: 'male' },
  { id: 'anand', gender: 'male' },
  { id: 'ashutosh', gender: 'male' },
  { id: 'dev', gender: 'male' },
  { id: 'gokul', gender: 'male' },
  { id: 'kabir', gender: 'male' },
  { id: 'mani', gender: 'male' },
  { id: 'manan', gender: 'male' },
  { id: 'mohit', gender: 'male' },
  { id: 'rahul', gender: 'male' },
  { id: 'ratan', gender: 'male' },
  { id: 'rehan', gender: 'male' },
  { id: 'rohan', gender: 'male' },
  { id: 'soham', gender: 'male' },
  { id: 'sumit', gender: 'male' },
  { id: 'sunny', gender: 'male' },
  { id: 'tarun', gender: 'male' },
  { id: 'varun', gender: 'male' },
  { id: 'vijay', gender: 'male' },
  { id: 'amelia', gender: 'female' },
  { id: 'ishita', gender: 'female' },
  { id: 'kavitha', gender: 'female' },
  { id: 'kavya', gender: 'female' },
  { id: 'neha', gender: 'female' },
  { id: 'pooja', gender: 'female' },
  { id: 'priya', gender: 'female' },
  { id: 'ritu', gender: 'female' },
  { id: 'roopa', gender: 'female' },
  { id: 'rupali', gender: 'female' },
  { id: 'shruti', gender: 'female' },
  { id: 'shreya', gender: 'female' },
  { id: 'simran', gender: 'female' },
  { id: 'sophia', gender: 'female' },
  { id: 'suhani', gender: 'female' },
  { id: 'tanya', gender: 'female' },
] as const;

export const DEFAULT_SARVAM_VOICE = 'shubh';

const SARVAM_VOICE_IDS: ReadonlySet<string> = new Set(SARVAM_VOICES.map((v) => v.id));

/** True when `id` is a real Bulbul v3 speaker — guards the agent's stored voice + the picker. */
export function isSarvamVoice(id: string | null | undefined): boolean {
  return !!id && SARVAM_VOICE_IDS.has(id);
}
