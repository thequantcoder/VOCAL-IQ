import { isAppError } from '@vocaliq/shared';
import { Webhook } from 'svix';
import { describe, expect, it } from 'vitest';
import { type SvixHeaders, verifyClerkWebhook } from './webhook';

// A valid Svix signing secret is `whsec_` + base64.
const SECRET = `whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`;

function signed(payload: string, timestamp = new Date()): SvixHeaders {
  const id = 'msg_test_1';
  const signature = new Webhook(SECRET).sign(id, timestamp, payload);
  return {
    'svix-id': id,
    'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
    'svix-signature': signature,
  };
}

describe('verifyClerkWebhook', () => {
  const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_1' } });

  it('verifies a correctly-signed payload and returns the parsed event', () => {
    const event = verifyClerkWebhook(SECRET, payload, signed(payload));
    expect(event.type).toBe('user.created');
    expect(event.data.id).toBe('user_1');
  });

  it('rejects a tampered payload', () => {
    const headers = signed(payload);
    expect(() => verifyClerkWebhook(SECRET, `${payload} `, headers)).toThrowError(
      /Invalid webhook signature/,
    );
  });

  it('rejects when the secret is not configured', () => {
    expect(() => verifyClerkWebhook(undefined, payload, signed(payload))).toThrowError(
      /not configured/,
    );
  });

  it('rejects when signature headers are missing (AuthError 401)', () => {
    try {
      verifyClerkWebhook(SECRET, payload, {});
      throw new Error('expected to throw');
    } catch (e) {
      expect(isAppError(e) && e.status === 401).toBe(true);
    }
  });
});
