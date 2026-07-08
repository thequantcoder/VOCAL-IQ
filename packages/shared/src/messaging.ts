import { z } from 'zod';

/**
 * Multi-channel messaging (Day 44) — the pure core. Template variable substitution,
 * opt-out/opt-in keyword classification, SMS segmentation + per-channel cost, and blended
 * voice→text campaign logic — all deterministic, unit-tested, and web-safe (no node
 * builtins). Webhook signature verification (which needs `node:crypto`) lives server-side
 * in `apps/api/src/messaging/webhook-verify.ts`. The provider HTTP calls are injected in
 * the api, so nothing here needs live credentials — self-audit A + C.
 */

export type MessageChannel =
  | 'WHATSAPP'
  | 'SMS'
  | 'EMAIL'
  | 'TELEGRAM'
  | 'MESSENGER'
  | 'INSTAGRAM'
  | 'RCS';
export type MessageDirection = 'OUTBOUND' | 'INBOUND';
export type MessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';

/** The text channels an agent can serve + blend into campaigns (Day 44 + Day 93). */
export const TEXT_MESSAGE_CHANNELS = [
  'SMS',
  'WHATSAPP',
  'TELEGRAM',
  'MESSENGER',
  'INSTAGRAM',
  'RCS',
] as const;

// ── Templates ─────────────────────────────────────────────────────────────────

export const messageTemplateInputSchema = z.object({
  channel: z.enum(TEXT_MESSAGE_CHANNELS),
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/, 'name must be lowercase letters, digits, or underscores'),
  language: z.string().min(2).max(10).default('en'),
  category: z.enum(['utility', 'marketing', 'authentication']).default('utility'),
  body: z.string().min(1).max(1024),
  active: z.boolean().default(true),
});
export type MessageTemplateInput = z.infer<typeof messageTemplateInputSchema>;

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Extract the distinct `{{variable}}` names referenced in a template body, in order. */
export function extractTemplateVars(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) {
    const name = m[1];
    if (name) seen.add(name);
  }
  return [...seen];
}

export interface RenderedTemplate {
  text: string;
  missing: string[]; // variables referenced but not supplied
}

/**
 * Render a template body by substituting `{{var}}` with values. Missing variables are
 * replaced with an empty string AND reported in `missing` so the caller can block a send
 * with an incomplete template rather than shipping "Hi {{name}}" to a customer.
 */
export function renderMessageTemplate(
  body: string,
  vars: Record<string, string> = {},
): RenderedTemplate {
  const missing: string[] = [];
  const text = body.replace(VAR_RE, (_full, name: string) => {
    const v = vars[name];
    if (v === undefined || v === '') {
      if (!missing.includes(name)) missing.push(name);
      return '';
    }
    return v;
  });
  return { text, missing };
}

// ── Opt-out / opt-in (compliance — self-audit C) ──────────────────────────────

const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'optout',
]);
const OPT_IN_KEYWORDS = new Set(['start', 'yes', 'unstop', 'optin']);

export type InboundIntent = 'opt_out' | 'opt_in' | 'message';

/** Classify an inbound message body as an opt-out, opt-in, or a normal message. */
export function classifyInbound(text: string): InboundIntent {
  const first = text.trim().toLowerCase().split(/\s+/)[0] ?? '';
  const word = first.replace(/[^a-z]/g, '');
  if (OPT_OUT_KEYWORDS.has(word)) return 'opt_out';
  if (OPT_IN_KEYWORDS.has(word)) return 'opt_in';
  return 'message';
}

// ── Cost (per-channel — self-audit D) ─────────────────────────────────────────

/** GSM-7 single-segment limit is 160 chars; concatenated segments are 153 each. */
export function smsSegments(text: string): number {
  const len = [...text].length;
  if (len === 0) return 1;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

// Indicative platform rates (USD). Re-verify per CLAUDE.md §13 before billing live.
const SMS_PER_SEGMENT_USD = 0.0079;
const WHATSAPP_PER_MESSAGE_USD = 0.005;
const RCS_PER_MESSAGE_USD = 0.007; // carrier RCS carries a per-message cost

/**
 * Estimated cost of one outbound message on a channel, given its rendered text. SMS is per-segment;
 * WhatsApp + RCS are per-message; Telegram/Messenger/Instagram bot APIs are free (metered $0). Any
 * unknown channel is $0 so a new channel can never silently over-bill (self-audit D).
 */
export function messageCostUsd(channel: MessageChannel, text: string): number {
  switch (channel) {
    case 'SMS':
      return Math.round(smsSegments(text) * SMS_PER_SEGMENT_USD * 1e6) / 1e6;
    case 'WHATSAPP':
      return WHATSAPP_PER_MESSAGE_USD;
    case 'RCS':
      return RCS_PER_MESSAGE_USD;
    default:
      return 0; // TELEGRAM / MESSENGER / INSTAGRAM / EMAIL — free-tier or metered elsewhere
  }
}

// ── Blended voice → text campaigns ────────────────────────────────────────────

export const channelMixSchema = z.object({
  voice: z.boolean().default(true),
  /** Send a text follow-up when the call ends in one of these outcomes. */
  textFallbackOn: z.array(z.string()).default([]),
  textChannel: z.enum(TEXT_MESSAGE_CHANNELS).default('SMS'),
  templateId: z.string().uuid().nullish(),
});
export type ChannelMix = z.infer<typeof channelMixSchema>;

export interface BlendedStep {
  sendText: boolean;
  channel?: MessageChannel;
  templateId?: string | null;
}

/**
 * Decide the next step in a blended campaign after a call finished. Sends a text follow-up
 * only when the call outcome is in `textFallbackOn` (e.g. NO_ANSWER, VOICEMAIL) and a
 * template is configured — so a completed conversation is never double-messaged.
 */
export function blendedNextStep(callOutcome: string, mix: ChannelMix): BlendedStep {
  const templateId = mix.templateId ?? null;
  if (!mix.textFallbackOn.includes(callOutcome) || !templateId) return { sendText: false };
  return { sendText: true, channel: mix.textChannel, templateId };
}
