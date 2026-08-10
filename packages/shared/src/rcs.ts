import { z } from 'zod';
import type { MessageChannel } from './messaging.js';

/**
 * Rich RCS engine core (GME-11) — the PURE, web-safe heart of rich messaging: a validated
 * `RichMessage` model (text / card / carousel / media + suggestion chips, mirroring Google RBM's
 * AgentContentMessage), a plain-text fallback projection, the RCS→WhatsApp→SMS cascade decision +
 * runner, and an RCS-capability TTL cache. No node builtins, no live keys — the concrete RBM/CPaaS
 * adapters that implement `RcsProvider` (and the service wiring) land in GME-12. Golden rule #2:
 * every provider stays behind this seam.
 */

// ── Rich content model (mirrors RBM CardContent / Suggestion) ─────────────────

export const rcsMediaHeightSchema = z.enum(['SHORT', 'MEDIUM', 'TALL']);
export type RcsMediaHeight = z.infer<typeof rcsMediaHeightSchema>;

export const rcsMediaSchema = z.object({
  fileUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  height: rcsMediaHeightSchema.default('MEDIUM'),
});
export type RcsMedia = z.infer<typeof rcsMediaSchema>;

/**
 * A suggestion chip: a quick `reply` or an `action` (dial / open url). `postbackData` is the opaque
 * token echoed back to us when the user taps it (drives the automation follow-up in GME-14+). Chip
 * label length mirrors RBM's 25-char limit.
 */
export const rcsSuggestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reply'),
    text: z.string().min(1).max(25),
    postbackData: z.string().max(2048).optional(),
  }),
  z.object({
    type: z.literal('action'),
    text: z.string().min(1).max(25),
    postbackData: z.string().max(2048).optional(),
    openUrl: z.string().url().optional(),
    dialNumber: z.string().min(1).max(40).optional(),
  }),
]);
export type RcsSuggestion = z.infer<typeof rcsSuggestionSchema>;

/** A single rich card (RBM CardContent). At most 4 suggestions per card; needs some visible content. */
export const rcsCardSchema = z
  .object({
    title: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    media: rcsMediaSchema.optional(),
    suggestions: z.array(rcsSuggestionSchema).max(4).default([]),
  })
  .refine((c) => Boolean(c.title || c.description || c.media), {
    message: 'a card needs at least a title, description, or media',
  });
export type RcsCard = z.infer<typeof rcsCardSchema>;

/** The rich message envelope — a discriminated union on `kind` (RBM text / standalone / carousel / media). */
export const richMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string().min(1).max(3072),
    suggestions: z.array(rcsSuggestionSchema).max(11).default([]),
  }),
  z.object({
    kind: z.literal('card'),
    card: rcsCardSchema,
    orientation: z.enum(['VERTICAL', 'HORIZONTAL']).default('VERTICAL'),
  }),
  z.object({
    kind: z.literal('carousel'),
    cards: z.array(rcsCardSchema).min(2).max(10),
    cardWidth: z.enum(['SMALL', 'MEDIUM']).default('MEDIUM'),
  }),
  z.object({
    kind: z.literal('media'),
    media: rcsMediaSchema,
    text: z.string().max(3072).optional(),
  }),
]);
export type RichMessage = z.infer<typeof richMessageSchema>;

export function parseRichMessage(input: unknown): RichMessage {
  return richMessageSchema.parse(input);
}

// ── Plain-text fallback projection ────────────────────────────────────────────

function suggestionLine(s: RcsSuggestion): string {
  if (s.type === 'action' && s.openUrl) return `${s.text}: ${s.openUrl}`;
  if (s.type === 'action' && s.dialNumber) return `${s.text}: ${s.dialNumber}`;
  return `• ${s.text}`;
}

function cardLines(c: RcsCard): string[] {
  const lines: string[] = [];
  if (c.title) lines.push(c.title);
  if (c.description) lines.push(c.description);
  if (c.media?.fileUrl) lines.push(c.media.fileUrl);
  for (const s of c.suggestions) lines.push(suggestionLine(s));
  return lines;
}

/**
 * Project a RichMessage to the plain-text variant sent when the cascade falls back to SMS/WhatsApp
 * (a non-RCS recipient). Flattens the visible copy — text, card title/description/media url, carousel
 * card summaries, and suggestion labels (with any action url/number) — so the substance still lands.
 */
export function richMessageToText(msg: RichMessage): string {
  const lines: string[] = [];
  switch (msg.kind) {
    case 'text':
      lines.push(msg.text);
      for (const s of msg.suggestions) lines.push(suggestionLine(s));
      break;
    case 'card':
      lines.push(...cardLines(msg.card));
      break;
    case 'carousel':
      msg.cards.forEach((c, i) => {
        lines.push(`(${i + 1}/${msg.cards.length})`);
        lines.push(...cardLines(c));
      });
      break;
    case 'media':
      if (msg.text) lines.push(msg.text);
      lines.push(msg.media.fileUrl);
      break;
  }
  return lines.filter(Boolean).join('\n').trim();
}

// ── Provider seam (adapters implement this in GME-12) ─────────────────────────

export interface RcsSendResult {
  ok: boolean;
  providerMessageId?: string | undefined;
  error?: string | undefined;
}

/**
 * The RCS provider seam implemented by the RBM + CPaaS adapters (GME-12). `capabilityCheck` asks a
 * provider whether an msisdn can receive RCS; `sendRich` delivers a RichMessage; typing/read are the
 * optional rich-UX signals. The SMS/WhatsApp fallback legs are driven by the existing SMS router, not
 * here — so this interface stays purely about the RCS channel.
 */
export interface RcsProvider {
  readonly id: string;
  capabilityCheck(msisdn: string): Promise<boolean>;
  sendRich(msisdn: string, message: RichMessage): Promise<RcsSendResult>;
  typingIndicator?(msisdn: string): Promise<void>;
  readReceipt?(msisdn: string, providerMessageId: string): Promise<void>;
}

// ── Cascade engine (RCS → WhatsApp → SMS) ─────────────────────────────────────

/** The per-send channel policy: prefer RCS, then these fallback channels in order. */
export const cascadePolicySchema = z.object({
  preferRcs: z.boolean().default(true),
  fallbackChannels: z.array(z.enum(['WHATSAPP', 'SMS'])).default(['SMS']),
});
export type CascadePolicy = z.infer<typeof cascadePolicySchema>;

/**
 * The ordered channel chain to attempt for a rich message: RCS first when the recipient is RCS-capable
 * AND the policy prefers it, then the policy's fallback channels (de-duplicated). A non-capable
 * recipient (or `preferRcs` off) skips RCS entirely and goes straight to the fallbacks.
 */
export function planCascade(rcsCapable: boolean, policy: CascadePolicy): MessageChannel[] {
  const chain: MessageChannel[] = [];
  if (rcsCapable && policy.preferRcs) chain.push('RCS');
  for (const ch of policy.fallbackChannels) if (!chain.includes(ch)) chain.push(ch);
  return chain;
}

export interface CascadeAttempt {
  channel: MessageChannel;
  ok: boolean;
  providerMessageId?: string | undefined;
  error?: string | undefined;
}

export interface CascadeOutcome {
  /** The channel that actually delivered, or null if every channel in the chain failed. */
  channelUsed: MessageChannel | null;
  providerMessageId?: string | undefined;
  /** The preferred channel we couldn't use + what we landed on (only set when a fallback happened). */
  fallbackFrom?: MessageChannel | undefined;
  fallbackTo?: MessageChannel | undefined;
  attempts: CascadeAttempt[];
}

/**
 * Run the cascade: attempt each channel in `chain` in order until one succeeds. `attempt` is supplied
 * by the caller (GME-12 wires RCS→`provider.sendRich`, SMS/WhatsApp→the SMS router with the text
 * variant). Records every attempt and, when the winning channel isn't the first tried, the fallback
 * provenance (`fallbackFrom`/`fallbackTo`) persisted onto the Message.
 */
export async function runCascade(
  chain: MessageChannel[],
  attempt: (channel: MessageChannel) => Promise<RcsSendResult>,
): Promise<CascadeOutcome> {
  const attempts: CascadeAttempt[] = [];
  const first = chain[0];
  for (const channel of chain) {
    let res: RcsSendResult;
    try {
      res = await attempt(channel);
    } catch (err) {
      res = { ok: false, error: (err as Error).message };
    }
    attempts.push({
      channel,
      ok: res.ok,
      providerMessageId: res.providerMessageId,
      error: res.error,
    });
    if (res.ok) {
      const fellBack = channel !== first;
      return {
        channelUsed: channel,
        providerMessageId: res.providerMessageId,
        ...(fellBack ? { fallbackFrom: first, fallbackTo: channel } : {}),
        attempts,
      };
    }
  }
  return { channelUsed: null, attempts };
}

// ── RCS-capability TTL cache ──────────────────────────────────────────────────

/**
 * A tiny TTL cache for msisdn→RCS-capability so the send path doesn't re-query the provider on every
 * message (RCS reach is stable-ish; a 6h default). Single-node + injectable clock — a Redis-backed
 * store replaces it at scale, mirroring the SMS router's in-memory health map. `get` returns undefined
 * on a miss or an expired entry.
 */
export class RcsCapabilityCache {
  private readonly store = new Map<string, { capable: boolean; expiresAt: number }>();

  constructor(
    private readonly ttlMs = 6 * 60 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(msisdn: string): boolean | undefined {
    const e = this.store.get(msisdn);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.store.delete(msisdn);
      return undefined;
    }
    return e.capable;
  }

  set(msisdn: string, capable: boolean): void {
    this.store.set(msisdn, { capable, expiresAt: this.now() + this.ttlMs });
  }
}
