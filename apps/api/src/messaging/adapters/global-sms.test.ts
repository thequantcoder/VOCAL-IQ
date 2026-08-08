import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../senders';
import { PlivoSmsSender } from './plivo';
import { TelnyxSmsSender } from './telnyx';
import { VonageSmsSender } from './vonage';

/** Global SMS adapters (GME-07) exercised with a fake HTTP transport — no live credentials. */

const okHttp = (json: unknown): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(json) }));

describe('VonageSmsSender', () => {
  it('posts api_key/secret + from/to/text and returns the message id (status 0)', async () => {
    const http = okHttp({ messages: [{ status: '0', 'message-id': 'v1' }] });
    const res = await new VonageSmsSender('K', 'S', 'VOCLIQ', http).send({
      to: '+14155550100',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'v1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(url).toContain('rest.nexmo.com/sms/json');
    const p = new URLSearchParams(init.body);
    expect(p.get('api_key')).toBe('K');
    expect(p.get('to')).toBe('14155550100'); // + stripped
    expect(p.get('text')).toBe('hi');
  });

  it('returns FAILED when Vonage reports a non-zero status', async () => {
    const res = await new VonageSmsSender(
      'K',
      'S',
      'F',
      okHttp({
        messages: [{ status: '2', 'error-text': 'Missing api_secret' }],
      }),
    ).send({ to: '+1', body: 'x' });
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('Missing api_secret');
  });
});

describe('PlivoSmsSender', () => {
  it('posts JSON src/dst/text with basic auth and returns the message uuid', async () => {
    const http = okHttp({ message_uuid: ['p1'], api_id: 'a1' });
    const res = await new PlivoSmsSender('AID', 'TOK', '+14155550100', http).send({
      to: '+14155550111',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'p1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('/v1/Account/AID/Message/');
    expect(init.headers.authorization).toContain('Basic ');
    const payload = JSON.parse(init.body);
    expect(payload.dst).toBe('14155550111'); // + stripped
    expect(payload.text).toBe('hi');
  });
});

describe('TelnyxSmsSender', () => {
  it('posts JSON from/to/text with a Bearer token and returns the message id', async () => {
    const http = okHttp({ data: { id: 't1' } });
    const res = await new TelnyxSmsSender('API', '+14155550100', http).send({
      to: '+14155550111',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 't1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('api.telnyx.com/v2/messages');
    expect(init.headers.authorization).toBe('Bearer API');
    expect(JSON.parse(init.body).to).toBe('+14155550111');
  });
});
