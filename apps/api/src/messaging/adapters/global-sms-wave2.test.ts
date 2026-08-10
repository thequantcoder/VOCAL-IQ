import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../senders';
import { InfobipSmsSender } from './infobip';
import { MessageBirdSmsSender } from './messagebird';
import { SinchSmsSender } from './sinch';

/** Global SMS wave-2 adapters (GME-08) exercised with a fake HTTP transport — no live credentials. */

const okHttp = (json: unknown): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(json) }));
type Call = [string, { headers: Record<string, string>; body: string }];

describe('SinchSmsSender', () => {
  it('posts a batch with Bearer auth + to[] and returns the batch id', async () => {
    const http = okHttp({ id: 's1' });
    const res = await new SinchSmsSender('SPID', 'TOK', '+19998887777', http).send({
      to: '+14155550100',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 's1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toContain('/xms/v1/SPID/batches');
    expect(init.headers.authorization).toBe('Bearer TOK');
    const payload = JSON.parse(init.body);
    expect(payload.to).toEqual(['+14155550100']);
    expect(payload.body).toBe('hi');
  });
});

describe('MessageBirdSmsSender', () => {
  it('posts form with AccessKey auth and returns the message id', async () => {
    const http = okHttp({ id: 'm1' });
    const res = await new MessageBirdSmsSender('AK', 'VOCLIQ', http).send({
      to: '+14155550100',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'm1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toContain('rest.messagebird.com/messages');
    expect(init.headers.authorization).toBe('AccessKey AK');
    const p = new URLSearchParams(init.body);
    expect(p.get('originator')).toBe('VOCLIQ');
    expect(p.get('recipients')).toBe('14155550100');
  });
});

describe('InfobipSmsSender', () => {
  it('posts to the account base URL with App auth and returns the message id', async () => {
    const http = okHttp({ messages: [{ messageId: 'i1', status: { groupName: 'PENDING' } }] });
    const res = await new InfobipSmsSender(
      'https://abc.api.infobip.com',
      'KEY',
      'VOCLIQ',
      http,
    ).send({ to: '+14155550100', body: 'hi' });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'i1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://abc.api.infobip.com/sms/2/text/advanced');
    expect(init.headers.authorization).toBe('App KEY');
    const payload = JSON.parse(init.body);
    expect(payload.messages[0].destinations[0].to).toBe('14155550100');
    expect(payload.messages[0].text).toBe('hi');
  });
});
