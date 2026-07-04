import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature, verifyTwilioSignature } from './webhook-verify';

/** Webhook signature verification (Day 44, self-audit C) — reject tampered/absent signatures. */

describe('verifyTwilioSignature', () => {
  const TOKEN = 'test_auth_token';
  const url = 'https://api.vocaliq.dev/public/messaging/twilio/t1';
  const params = { From: '+15551234567', Body: 'STOP', MessageSid: 'SM123' };
  const sign = () => {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k as keyof typeof params]}`)
      .join('');
    return createHmac('sha1', TOKEN)
      .update(url + sorted)
      .digest('base64');
  };
  it('accepts a correct signature and rejects a tampered body / absent header', () => {
    expect(verifyTwilioSignature(url, params, sign(), TOKEN)).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, Body: 'hello' }, sign(), TOKEN)).toBe(false);
    expect(verifyTwilioSignature(url, params, undefined, TOKEN)).toBe(false);
  });
});

describe('verifyMetaSignature', () => {
  const SECRET = 'meta_app_secret';
  const body = '{"entry":[{"changes":[]}]}';
  const header = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
  it('accepts a correct signature and rejects a tampered payload / absent header', () => {
    expect(verifyMetaSignature(body, header, SECRET)).toBe(true);
    expect(verifyMetaSignature(`${body} `, header, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false);
  });
});
