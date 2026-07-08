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

/**
 * Verify a Telegram webhook (Day 93). Telegram echoes the `secret_token` you set on `setWebhook` in
 * the `X-Telegram-Bot-Api-Secret-Token` header — a shared secret, compared constant-time. (Messenger
 * + Instagram reuse {@link verifyMetaSignature} — same X-Hub-Signature-256 HMAC as WhatsApp.)
 */
export function verifyTelegramSecret(
  headerToken: string | undefined,
  expectedSecret: string,
): boolean {
  if (!headerToken || !expectedSecret) return false;
  return safeEqual(headerToken, expectedSecret);
}

/**
 * Verify an RCS provider webhook (Day 93). RCS gateways are provider-specific; the common shape is an
 * `sha256=<hex>` HMAC of the raw body with a shared signing secret — verified constant-time here.
 */
export function verifyRcsSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  signingSecret: string,
): boolean {
  if (!signatureHeader || !signingSecret) return false;
  const digest = createHmac('sha256', signingSecret).update(rawBody, 'utf8').digest('hex');
  // Accept both `sha256=<hex>` and a bare hex header for gateway flexibility.
  return safeEqual(`sha256=${digest}`, signatureHeader) || safeEqual(digest, signatureHeader);
}
