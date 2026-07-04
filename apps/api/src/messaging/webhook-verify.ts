import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Messaging webhook signature verification (Day 44) — server-only (uses `node:crypto`, so it
 * lives here rather than in the web-safe `@vocaliq/shared`). Twilio signs with HMAC-SHA1 over
 * URL + sorted params; Meta (WhatsApp Cloud) signs the RAW body with HMAC-SHA256. Both are
 * constant-time compared (self-audit C — no timing oracle).
 */

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a Twilio webhook signature: base64(HMAC-SHA1(authToken, url + sorted param
 * key+value concatenation)). See Twilio's "Validating Requests" docs.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
  authToken: string,
): boolean {
  if (!signature || !authToken) return false;
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  const expected = createHmac('sha1', authToken)
    .update(url + sorted, 'utf8')
    .digest('base64');
  return safeEqual(expected, signature);
}

/**
 * Verify a Meta (WhatsApp Cloud) webhook signature header `sha256=<hex>` = HMAC-SHA256 of
 * the RAW request body with the app secret. See Meta's "Webhooks — validating payloads".
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  return safeEqual(expected, signatureHeader);
}
