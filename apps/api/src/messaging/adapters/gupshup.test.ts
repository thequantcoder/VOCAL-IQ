import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../senders';
import { GupshupSmsSender } from './gupshup';

/** Gupshup Enterprise SMS adapter (GME-05) exercised with a fake HTTP transport — no live creds. */

const okHttp = (json: unknown): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(json) }));

describe('GupshupSmsSender', () => {
  it('posts SendMessage with plain auth + json format, returning the message id', async () => {
    const http = okHttp({ response: { status: 'success', id: 'gs_1', phone: '919812345678' } });
    const res = await new GupshupSmsSender('uid', 'pw', 'VOCLIQ', http).send({
      to: '+919812345678',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'gs_1' });

    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(url).toContain('/GatewayAPI/rest');
    const params = new URLSearchParams(init.body);
    expect(params.get('method')).toBe('SendMessage');
    expect(params.get('userid')).toBe('uid');
    expect(params.get('send_to')).toBe('919812345678'); // leading + stripped
    expect(params.get('msg')).toBe('hi');
    expect(params.get('mask')).toBe('VOCLIQ');
    expect(params.get('format')).toBe('json');
  });

  it('returns FAILED on a non-success response', async () => {
    const res = await new GupshupSmsSender(
      'u',
      'p',
      'S',
      okHttp({
        response: { status: 'error', details: 'invalid credentials' },
      }),
    ).send({ to: '+91', body: 'x' });
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('invalid credentials');
  });
});
