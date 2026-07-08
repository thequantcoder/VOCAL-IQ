import { describe, expect, it, vi } from 'vitest';
import {
  type HttpClient,
  MetaMessagingSender,
  RcsSender,
  TelegramSender,
  TwilioSmsSender,
  WhatsAppSender,
  buildSenders,
} from './senders';

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

describe('TelegramSender (Day 93)', () => {
  it('posts to the Bot API and returns the message id', async () => {
    const http = okHttp({ ok: true, result: { message_id: 42 } });
    const res = await new TelegramSender('BOTTOKEN', http).send({ to: '99887766', body: 'hi' });
    expect(res).toEqual({ status: 'SENT', providerMessageId: '42' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(url).toContain('/botBOTTOKEN/sendMessage');
    expect(JSON.parse(init.body)).toEqual({ chat_id: '99887766', text: 'hi' });
  });
});

describe('MetaMessagingSender (Messenger / Instagram, Day 93)', () => {
  it('posts to the Graph Send API with the recipient id', async () => {
    const http = okHttp({ message_id: 'mid.999' });
    const res = await new MetaMessagingSender('MESSENGER', 'PAGETOK', http).send({
      to: 'PSID123',
      body: 'hello',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'mid.999' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(url).toContain('access_token=PAGETOK');
    expect(JSON.parse(init.body).recipient.id).toBe('PSID123');
  });
});

describe('RcsSender (Day 93)', () => {
  it('posts to the configured gateway with a bearer token', async () => {
    const http = okHttp({ id: 'rcs-1' });
    const res = await new RcsSender('https://rcs.example/send', 'RCSTOK', http).send({
      to: '+15551230000',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'rcs-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('https://rcs.example/send');
    expect(init.headers.authorization).toBe('Bearer RCSTOK');
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
  it('builds the Day-93 channels only when their keys are set', () => {
    const all = buildSenders({
      TELEGRAM_BOT_TOKEN: 'bt',
      MESSENGER_PAGE_ACCESS_TOKEN: 'mt',
      INSTAGRAM_ACCESS_TOKEN: 'it',
      RCS_API_URL: 'https://rcs/send',
      RCS_API_TOKEN: 'rt',
    } as NodeJS.ProcessEnv);
    expect(all.TELEGRAM).toBeDefined();
    expect(all.MESSENGER).toBeDefined();
    expect(all.INSTAGRAM).toBeDefined();
    expect(all.RCS).toBeDefined();
    // RCS needs BOTH url + token.
    expect(
      buildSenders({ RCS_API_URL: 'https://rcs/send' } as NodeJS.ProcessEnv).RCS,
    ).toBeUndefined();
  });
});
