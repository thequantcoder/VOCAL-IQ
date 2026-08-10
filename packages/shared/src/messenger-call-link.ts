import { z } from 'zod';

/**
 * Messenger click-to-call entry points + the business-context payload convention (MEC-07). A "call us on
 * Messenger" entry point (`m.me` link / audio call button on the Page) can carry a `ref` that Meta echoes
 * back to the webhook — the Messenger analog of WhatsApp's `cta_payload` / `deeplink_payload` — so the AI
 * agent can greet with context (which campaign, which post, what intent).
 *
 * The KEY difference from WhatsApp (`whatsapp-call-link.ts`): a Messenger `m.me` `ref` has a RESTRICTED
 * character set (Meta allows only alphanumerics and `-_.=+/:`), so we cannot drop a raw `&`-joined query
 * string into it. We therefore keep our human-readable context as a URLSearchParams string INTERNALLY,
 * then wrap it in a **base64url token** for the wire `ref` (base64url's `A-Za-z0-9-_` alphabet is a strict
 * subset of the allowed ref charset, so the ref is always valid — this is about OUR encoding being valid,
 * not an assumption about Meta's behaviour). The exact call-button `ref` field is confirmed at MEC-00.
 */

/** Max characters for the human-readable context payload (before base64 wrapping) — kept small. */
export const MESSENGER_CALL_PAYLOAD_MAX = 256;

export const messengerCallContextSchema = z.object({
  /** Why the user is calling — greeted by the agent (e.g. "book_demo", "support"). */
  intent: z.string().trim().max(64).optional(),
  /** Marketing campaign / source this entry point belongs to. */
  campaign: z.string().trim().max(64).optional(),
  /** A reference the agent can look up — order id, booking id, lead id. */
  reference: z.string().trim().max(64).optional(),
  /** Free-form extra key/values (kept short) — namespaced `c.<key>` in the payload. */
  custom: z.record(z.string().max(40), z.string().max(120)).optional(),
});
export type MessengerCallContext = z.infer<typeof messengerCallContextSchema>;

/** Normalize a Page handle for `m.me/<page>` — accept a username, `@username`, numeric id, or full URL. */
export function normalizeMessengerPage(page: string): string {
  const raw = (page ?? '').trim();
  const withoutUrl = raw
    .replace(/^https?:\/\/(?:www\.)?m\.me\//i, '')
    .replace(/^https?:\/\/(?:www\.)?(?:facebook|fb)\.com\//i, '');
  return withoutUrl
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

// ── base64url (isomorphic node+browser, no deps) — keeps the wire `ref` within Meta's allowed charset ──

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out += B64URL[b0 >> 2] ?? '';
    out += B64URL[((b0 & 0x03) << 4) | (b1 >> 4)] ?? '';
    if (!hasB1) break;
    out += B64URL[((b1 & 0x0f) << 2) | (b2 >> 6)] ?? '';
    if (!hasB2) break;
    out += B64URL[b2 & 0x3f] ?? '';
  }
  return out;
}

function fromBase64Url(input: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of input ?? '') {
    const val = B64URL.indexOf(ch);
    if (val < 0) continue; // tolerate stray chars
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// ── Context payload (our convention — human-readable internal form) ──────────────────────────────────

/**
 * Compose the human-readable context string from a business-call context. Empty/blank fields are dropped;
 * `custom` entries become `c.<key>`. Returns '' when there's no context. Throws if the result would
 * exceed {@link MESSENGER_CALL_PAYLOAD_MAX} (so a caller can surface an inline validation error).
 */
export function encodeMessengerCallContext(ctx: MessengerCallContext): string {
  const p = new URLSearchParams();
  if (ctx.intent?.trim()) p.set('intent', ctx.intent.trim());
  if (ctx.campaign?.trim()) p.set('campaign', ctx.campaign.trim());
  if (ctx.reference?.trim()) p.set('ref', ctx.reference.trim());
  for (const [k, v] of Object.entries(ctx.custom ?? {})) {
    if (k.trim() && v?.trim()) p.set(`c.${k.trim()}`, v.trim());
  }
  const out = p.toString();
  if (out.length > MESSENGER_CALL_PAYLOAD_MAX) {
    throw new Error(
      `Call context payload is too long (${out.length}/${MESSENGER_CALL_PAYLOAD_MAX} chars)`,
    );
  }
  return out;
}

/** Parse a human-readable context string back into a context (tolerant of unknown/garbage keys). */
export function decodeMessengerCallContext(payload: string): MessengerCallContext {
  const p = new URLSearchParams(payload ?? '');
  const custom: Record<string, string> = {};
  for (const [k, v] of p.entries()) {
    if (k.startsWith('c.')) custom[k.slice(2)] = v;
  }
  const ctx: MessengerCallContext = {};
  const intent = p.get('intent');
  const campaign = p.get('campaign');
  const ref = p.get('ref');
  if (intent) ctx.intent = intent;
  if (campaign) ctx.campaign = campaign;
  if (ref) ctx.reference = ref;
  if (Object.keys(custom).length > 0) ctx.custom = custom;
  return ctx;
}

// ── Wire `ref` (base64url of the context string) — safe under Meta's m.me ref charset ────────────────

/** Wrap a call context into a wire-safe `m.me` `ref` token (base64url). '' when there's no context. */
export function toMessengerCallRef(ctx: MessengerCallContext): string {
  const payload = encodeMessengerCallContext(ctx);
  return payload ? toBase64Url(payload) : '';
}

/** Decode a wire `ref` token (from the webhook) back into a call context. Tolerant of empty/garbage. */
export function fromMessengerCallRef(ref: string): MessengerCallContext {
  if (!ref?.trim()) return {};
  return decodeMessengerCallContext(fromBase64Url(ref.trim()));
}

// ── m.me links ───────────────────────────────────────────────────────────────────────────────────────

/** Build a base `m.me/<page>` link (no context). */
export function mMeLink(page: string): string {
  return `https://m.me/${normalizeMessengerPage(page)}`;
}

/**
 * Build an `m.me/<page>?ref=<ref>` call entry link carrying a business-context payload. The context is
 * base64url-wrapped so the `ref` is valid under Meta's restricted charset. Works on mobile Messenger.
 */
export function messengerCallLink(page: string, ctx: MessengerCallContext = {}): string {
  const base = mMeLink(page);
  const ref = toMessengerCallRef(ctx);
  return ref ? `${base}?ref=${ref}` : base;
}

// ── Agent runtime helpers (MEC-04) ───────────────────────────────────────────────────────────────────

/**
 * Flatten a decoded call context into the agent's runtime flow variables. The reserved keys (`intent`,
 * `campaign`, `reference`) plus any `custom` entries become a plain string map the flow/LLM can read.
 * Empty fields are dropped so a variable is only set when it has a value.
 */
export function messengerCallContextToVars(ctx: MessengerCallContext): Record<string, string> {
  const vars: Record<string, string> = {};
  if (ctx.intent?.trim()) vars.intent = ctx.intent.trim();
  if (ctx.campaign?.trim()) vars.campaign = ctx.campaign.trim();
  if (ctx.reference?.trim()) vars.reference = ctx.reference.trim();
  for (const [k, v] of Object.entries(ctx.custom ?? {})) {
    if (k.trim() && v?.trim()) vars[k.trim()] = v.trim();
  }
  return vars;
}

/**
 * Compose a short, natural-language brief the AI agent prepends to its system prompt so it opens the call
 * already knowing why the customer tapped "call" on Messenger (MEC-04). Returns '' when there's no usable
 * context. Purely derived from the (already-validated) context — no PII beyond what the business encoded.
 */
export function buildMessengerCallBrief(ctx: MessengerCallContext): string {
  const lines: string[] = [];
  if (ctx.intent?.trim()) lines.push(`- Intent: ${ctx.intent.trim()}`);
  if (ctx.campaign?.trim()) lines.push(`- Campaign / source: ${ctx.campaign.trim()}`);
  if (ctx.reference?.trim())
    lines.push(`- Reference (order/booking/lead id): ${ctx.reference.trim()}`);
  for (const [k, v] of Object.entries(ctx.custom ?? {})) {
    if (k.trim() && v?.trim()) lines.push(`- ${k.trim()}: ${v.trim()}`);
  }
  if (lines.length === 0) return '';
  return [
    'This customer started this call from a Messenger entry point with the following context. ' +
      'Acknowledge it naturally in your opening line; do not read it back verbatim.',
    ...lines,
  ].join('\n');
}
