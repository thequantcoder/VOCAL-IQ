/**
 * WhatsApp Calling SIP mode (WAC-10) — the pure helpers. In SIP mode Meta bridges calls to a PBX
 * tenant's TLS SIP server and puts call context in `x-wa-meta-*` SIP headers (there's no `calls`
 * webhook with SDP). This parses those headers so a SIP call correlates to a WACID + carries context +
 * duration for metering. See `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` §A.2/§A.6/§A.8.
 */

export interface WaMetaHeaders {
  /** The WhatsApp call id (WACID) — correlates the SIP call to our Call records. */
  wacid?: string;
  /** The user's WhatsApp id. */
  userId?: string;
  /** Context from a tapped call button (user-initiated). */
  ctaPayload?: string;
  /** Context from a `wa.me/call` deep link (user-initiated). */
  deeplinkPayload?: string;
  /** Call duration in seconds (present on BYE) — used to meter. */
  durationSec?: number;
}

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      const raw = Array.isArray(v) ? v[0] : v;
      return raw && raw.length > 0 ? raw : undefined;
    }
  }
  return undefined;
}

/** Parse Meta's `x-wa-meta-*` SIP headers (case-insensitive) into structured call context. */
export function parseWaMetaHeaders(headers: HeaderBag): WaMetaHeaders {
  const out: WaMetaHeaders = {};
  const wacid = headerValue(headers, 'x-wa-meta-wacid');
  const userId = headerValue(headers, 'x-wa-meta-user-id');
  const cta = headerValue(headers, 'x-wa-meta-cta-payload');
  const deeplink = headerValue(headers, 'x-wa-meta-deeplink-payload');
  const durationRaw = headerValue(headers, 'x-wa-meta-call-duration');
  if (wacid) out.wacid = wacid;
  if (userId) out.userId = userId;
  if (cta) out.ctaPayload = cta;
  if (deeplink) out.deeplinkPayload = deeplink;
  if (durationRaw !== undefined) {
    const n = Number.parseInt(durationRaw, 10);
    if (Number.isFinite(n) && n >= 0) out.durationSec = n;
  }
  return out;
}

/** The SIP request URI Meta expects for an outbound INVITE to a business number (§A.2). */
export function waSipRequestUri(businessNumber: string): string {
  const digits = (businessNumber ?? '').replace(/[^\d]/g, '');
  return `sip:+${digits}@wa.meta.vc;transport=tls`;
}

/** The digest-auth realm Meta uses for SIP (business number = username, Meta-generated password). */
export const WA_SIP_REALM = 'wa.meta.vc';
/** Default SIP-over-TLS port. */
export const WA_SIP_TLS_PORT = 5061;
