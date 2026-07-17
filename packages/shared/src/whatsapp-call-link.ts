import { z } from 'zod';

/**
 * WhatsApp click-to-call links + the business-context payload convention (WAC-07). A "call us on
 * WhatsApp" entry point (deep link / QR / website button) carries a compact `biz_payload` that Meta
 * echoes back on the connect webhook as `cta_payload` / `deeplink_payload` (WAC-02) — so the AI agent
 * can greet with context (which campaign, which order, what intent). Encoding is a URL-query string
 * (`URLSearchParams`, isomorphic node+browser) so it stays human-readable and URL-safe; nested custom
 * fields are namespaced `c.<key>`. Kept small (Meta caps payload length) — validated on compose.
 */

/** Max characters for the composed payload (Meta's referral/CTA payloads are length-limited). */
export const WA_CALL_PAYLOAD_MAX = 256;

export const whatsappCallContextSchema = z.object({
  /** Why the user is calling — greeted by the agent (e.g. "book_demo", "support"). */
  intent: z.string().trim().max(64).optional(),
  /** Marketing campaign / source this entry point belongs to. */
  campaign: z.string().trim().max(64).optional(),
  /** A reference the agent can look up — order id, booking id, lead id. */
  reference: z.string().trim().max(64).optional(),
  /** Free-form extra key/values (kept short) — namespaced `c.<key>` in the payload. */
  custom: z.record(z.string().max(40), z.string().max(120)).optional(),
});
export type WhatsAppCallContext = z.infer<typeof whatsappCallContextSchema>;

/** Digits-only E.164 (no `+`/spaces) as `wa.me/call/<number>` expects. */
export function normalizeWaNumber(e164: string): string {
  return (e164 ?? '').replace(/[^\d]/g, '');
}

/**
 * Compose the `biz_payload` from a business-call context. Empty/blank fields are dropped; `custom`
 * entries become `c.<key>`. Returns '' when there's no context. Throws if the result would exceed
 * {@link WA_CALL_PAYLOAD_MAX} (so a caller can surface an inline validation error).
 */
export function encodeWhatsAppCallPayload(ctx: WhatsAppCallContext): string {
  const p = new URLSearchParams();
  if (ctx.intent?.trim()) p.set('intent', ctx.intent.trim());
  if (ctx.campaign?.trim()) p.set('campaign', ctx.campaign.trim());
  if (ctx.reference?.trim()) p.set('ref', ctx.reference.trim());
  for (const [k, v] of Object.entries(ctx.custom ?? {})) {
    if (k.trim() && v?.trim()) p.set(`c.${k.trim()}`, v.trim());
  }
  const out = p.toString();
  if (out.length > WA_CALL_PAYLOAD_MAX) {
    throw new Error(
      `Call context payload is too long (${out.length}/${WA_CALL_PAYLOAD_MAX} chars)`,
    );
  }
  return out;
}

/** Parse a `biz_payload` back into a context (tolerant — unknown/garbage → the fields it can read). */
export function decodeWhatsAppCallPayload(payload: string): WhatsAppCallContext {
  const p = new URLSearchParams(payload ?? '');
  const custom: Record<string, string> = {};
  for (const [k, v] of p.entries()) {
    if (k.startsWith('c.')) custom[k.slice(2)] = v;
  }
  const ctx: WhatsAppCallContext = {};
  const intent = p.get('intent');
  const campaign = p.get('campaign');
  const ref = p.get('ref');
  if (intent) ctx.intent = intent;
  if (campaign) ctx.campaign = campaign;
  if (ref) ctx.reference = ref;
  if (Object.keys(custom).length > 0) ctx.custom = custom;
  return ctx;
}

/**
 * Build a `wa.me/call` deep link for a business number + optional context payload. The payload is
 * URL-encoded into `biz_payload`. Works on mobile WhatsApp; note it does not launch on desktop.
 */
export function waCallDeepLink(businessNumber: string, payload = ''): string {
  const num = normalizeWaNumber(businessNumber);
  const base = `https://wa.me/call/${num}`;
  return payload ? `${base}?biz_payload=${encodeURIComponent(payload)}` : base;
}

/**
 * Flatten a decoded call context into the agent's runtime flow variables (WAC-04). The reserved keys
 * (`intent`, `campaign`, `reference`) plus any `custom` entries become a plain string map the flow/LLM
 * can read to open in context. Empty fields are dropped so a variable is only set when it has a value.
 */
export function whatsAppCallContextToVars(ctx: WhatsAppCallContext): Record<string, string> {
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
 * Compose a short, natural-language brief the AI agent prepends to its system prompt so it opens the
 * call already knowing why the customer tapped "call" (WAC-04, plan §D — context-aware answering).
 * Returns '' when there's no usable context, so the caller appends nothing. Purely derived from the
 * (already-validated) context — no PII beyond what the business itself encoded into its own link.
 */
export function buildWhatsAppCallBrief(ctx: WhatsAppCallContext): string {
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
    'This customer started this call from a WhatsApp entry point with the following context. ' +
      'Acknowledge it naturally in your opening line; do not read it back verbatim.',
    ...lines,
  ].join('\n');
}
