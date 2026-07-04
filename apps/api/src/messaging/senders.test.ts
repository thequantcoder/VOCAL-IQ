import { describe, expect, it, vi } from 'vitest';
import { type HttpClient, TwilioSmsSender, WhatsAppSender, buildSenders } from './senders';

/** Channel adapters (Day 44) exercised with a fake HTTP transport — no live credentials. */

function okHttp(bodyJson: unknown): HttpClient {
  return vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(bodyJson) }));
}

describe('WhatsAppSender', () => {
  it('posts a text message and returns the provider id', async () => {
    const http = okHttp({ messages: [{ id: 'wamid.ABC' }] });
    const sender = new WhatsAppSender('PNID', 'TOKEN', http);
    const res = await sender.send({ to: '+15551230000', body: 'hi' });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'wamid.ABC' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('/PNID/messages');
    expect(init.headers.authorization).toBe('Bearer TOKEN');
    expect(JSON.parse(init.body).type).toBe('text');
  });

  it('returns FAILED on a non-2xx without throwing', async () => {
    const http: HttpClient = async () => ({
      ok: false,
      status: 401,
      text: async () => 'bad token',
    });
    const res = await new WhatsAppSender('P', 'T', http).send({ to: '+1', body: 'x' });
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('401');
  });
});

describe('TwilioSmsSender', () => {
  it('posts form-encoded and returns the sid', async () => {
    const http = okHttp({ sid: 'SM123' });
    const res = await new TwilioSmsSender('AC1', 'TOK', '+15550000000', http).send({
      to: '+15551230000',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'SM123' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('/Accounts/AC1/Messages.json');
    expect(init.headers.authorization).toMatch(/^Basic /);
    expect(init.body).toContain('To=%2B15551230000');
  });
});

describe('buildSenders (gated)', () => {
  it('builds only channels whose credentials are present', () => {
    expect(buildSenders({})).toEqual({});
    const smsOnly = buildSenders({
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'TOK',
      TWILIO_MESSAGING_FROM: '+15550000000',
    } as NodeJS.ProcessEnv);
    expect(smsOnly.SMS).toBeDefined();
    expect(smsOnly.WHATSAPP).toBeUndefined();
  });
});
