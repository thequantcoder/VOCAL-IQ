import { z } from 'zod';

/**
 * Messaging consent (GME-14) — the pure core of "can I text you the details?" consent capture.
 * A tenant may only message a contact on a channel once lawful consent is on record (enforced by the
 * unified send-gate in GME-15). This module is web-safe + deterministic: the consent channels, the
 * API schemas, and a heuristic that extracts a consent decision from a call transcript (the LLM path
 * is injected in the voice/post-call layer; this keyword heuristic is the keys-none default + fallback).
 */

export const MESSAGING_CONSENT_CHANNELS = ['SMS', 'WHATSAPP', 'RCS'] as const;
export type MessagingConsentChannel = (typeof MESSAGING_CONSENT_CHANNELS)[number];

/** Lawful basis for the consent (audited on the ConsentRecord). */
export const MESSAGING_CONSENT_BASES = [
  'in_call_consent',
  'web_form',
  'imported',
  'explicit_optin',
] as const;
export type MessagingConsentBasis = (typeof MESSAGING_CONSENT_BASES)[number];

// ── API schemas ───────────────────────────────────────────────────────────────

export const setMessagingConsentSchema = z.object({
  phone: z.string().min(1).max(40),
  channels: z.array(z.enum(MESSAGING_CONSENT_CHANNELS)).min(1),
  granted: z.boolean(),
  basis: z.enum(MESSAGING_CONSENT_BASES).default('in_call_consent'),
  region: z.string().min(2).max(10).default('US'),
  /** Free-text provenance (e.g. call id / agent id) stored for audit. */
  source: z.string().max(120).optional(),
});
export type SetMessagingConsentInput = z.infer<typeof setMessagingConsentSchema>;

// ── Transcript intent extraction (heuristic; LLM path injected elsewhere) ──────

export interface ConsentIntent {
  /** True = the contact agreed to be messaged; false = they declined. */
  granted: boolean;
  /** The channels the consent applies to (defaults to SMS when only "text me" is said). */
  channels: MessagingConsentChannel[];
}

const AFFIRMATIVE =
  /\b(yes|yeah|yep|yup|sure|ok|okay|please\s+do|go\s+ahead|sounds?\s+good|that\s+works|absolutely|of\s+course|definitely)\b/;
const NEGATIVE =
  /\b(no|nope|nah|don'?t|do\s+not|not\s+interested|no\s+thanks?|stop|never|rather\s+not)\b/;

const CHANNEL_PATTERNS: { re: RegExp; channel: MessagingConsentChannel }[] = [
  { re: /\bwhats\s?app\b/, channel: 'WHATSAPP' },
  { re: /\brcs\b/, channel: 'RCS' },
  { re: /\b(text|sms|message|msg)\b/, channel: 'SMS' },
];

/**
 * Extract a messaging-consent decision from a (portion of a) call transcript. Returns null when the
 * transcript has no messaging-consent topic at all; otherwise a decision + the channels it covers.
 * A negative cue overrides an affirmative one (a "no" is never read as consent). Deterministic — the
 * richer LLM extractor is injected by the caller (post-call), with this as the fallback.
 */
export function detectConsentIntent(transcript: string): ConsentIntent | null {
  const text = transcript.toLowerCase();
  const channels: MessagingConsentChannel[] = [];
  for (const { re, channel } of CHANNEL_PATTERNS) {
    if (re.test(text) && !channels.includes(channel)) channels.push(channel);
  }
  // No channel mention AND no "send you the details" cue → not a consent topic.
  const hasSendCue =
    /\b(send|share)\b/.test(text) && /\b(details?|link|info|quote|brochure)\b/.test(text);
  if (channels.length === 0 && !hasSendCue) return null;

  const affirmative = AFFIRMATIVE.test(text);
  const negative = NEGATIVE.test(text);
  if (!affirmative && !negative) return null; // topic present but no decision expressed

  return {
    granted: affirmative && !negative,
    channels: channels.length > 0 ? channels : ['SMS'],
  };
}
