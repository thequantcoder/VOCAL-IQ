import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../senders';
import { Msg91SmsSender } from './msg91';

/** MSG91 v5 flow adapter (GME-05) exercised with a fake HTTP transport — no live credentials. */

const okHttp = (json: unknown): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(json) }));

describe('Msg91SmsSender', () => {
  it('posts to the v5 flow API with authkey + flow_id + sender, returning the request id', async () => {
    const http = okHttp({ type: 'success', message: 'req_123' });
    const res = await new Msg91SmsSender('AK', 'VOCLIQ', 'flow_1', http).send({
      to: '+919812345678',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'req_123' });

    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('/api/v5/flow/');
    expect(init.headers.authkey).toBe('AK');
    const payload = JSON.parse(init.body);
    expect(payload.flow_id).toBe('flow_1');
    expect(payload.sender).toBe('VOCLIQ');
    expect(payload.recipients[0].mobiles).toBe('919812345678'); // leading + stripped
    expect(payload.recipients[0].body).toBe('hi');
  });

  it('returns FAILED on a type=error response', async () => {
    const res = await new Msg91SmsSender(
      'AK',
      'S',
      'f',
      okHttp({ type: 'error', message: 'bad template' }),
    ).send({
      to: '+91',
      body: 'x',
    });
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('bad template');
  });

  it('returns FAILED on a non-2xx without throwing', async () => {
    const http: HttpClient = async () => ({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    expect(
      (await new Msg91SmsSender('AK', 'S', 'f', http).send({ to: '+91', body: 'x' })).status,
    ).toBe('FAILED');
  });
});
