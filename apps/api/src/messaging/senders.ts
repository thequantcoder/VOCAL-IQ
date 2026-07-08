import type { MessageChannel, MessageStatus } from '@vocaliq/shared';

/**
 * Messaging channel adapters (Day 44) — the send side of the messaging abstraction, mirroring
 * the provider-router. WhatsApp Cloud API + Twilio SMS each implement `MessageSender`; HTTP is
 * injected so they're unit-testable offline (self-audit A). Senders are built ONLY when their
 * credentials are configured — with none set the service still records + queues messages but
 * never dispatches (gated, like Days 10/35/36). Credentials are read from env, never logged.
 */

export interface OutboundMessage {
  to: string;
  body: string;
  /** WhatsApp template send (approved template) — falls back to free-form text otherwise. */
  templateName?: string;
  language?: string;
}

export interface SendResult {
  providerMessageId?: string;
  status: Extract<MessageStatus, 'SENT' | 'FAILED'>;
  error?: string;
}

export interface MessageSender {
  readonly channel: MessageChannel;
  send(msg: OutboundMessage): Promise<SendResult>;
}

/** Minimal fetch-like transport so senders are testable with a fake (mirrors connectors). */
export type HttpClient = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export const fetchHttp: HttpClient = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(8000) });

/** WhatsApp Cloud API (Meta Graph). Sends free-form text; templates via `templateName`. */
export class WhatsAppSender implements MessageSender {
  readonly channel: MessageChannel = 'WHATSAPP';
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`;
    const payload = msg.templateName
      ? {
          messaging_product: 'whatsapp',
          to: msg.to,
          type: 'template',
          template: { name: msg.templateName, language: { code: msg.language ?? 'en' } },
        }
      : {
          messaging_product: 'whatsapp',
          to: msg.to,
          type: 'text',
          text: { body: msg.body },
        };
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `WhatsApp ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { messages?: { id: string }[] };
      const id = data.messages?.[0]?.id;
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}

/** Twilio SMS via the Messages REST API (form-encoded, basic auth). */
export class TwilioSmsSender implements MessageSender {
  readonly channel: MessageChannel = 'SMS';
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const form = new URLSearchParams({ To: msg.to, From: this.from, Body: msg.body }).toString();
    const basic = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: {
          authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Twilio ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { sid?: string };
      return data.sid ? { status: 'SENT', providerMessageId: data.sid } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}

/** Telegram Bot API (Day 93). `sendMessage` with a chat id (the `to`) — free, JSON, bot-token auth. */
export class TelegramSender implements MessageSender {
  readonly channel: MessageChannel = 'TELEGRAM';
  constructor(
    private readonly botToken: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: msg.to, text: msg.body }),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Telegram ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { result?: { message_id?: number } };
      const id = data.result?.message_id;
      return id ? { status: 'SENT', providerMessageId: String(id) } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}

/**
 * Meta Messenger + Instagram DM (Day 93) — both use the same Graph Send API (`/me/messages`) with a
 * page/IG-scoped access token; only the channel label differs. `to` is the PSID / IG-scoped user id.
 */
export class MetaMessagingSender implements MessageSender {
  constructor(
    readonly channel: MessageChannel,
    private readonly accessToken: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${this.accessToken}`;
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: msg.to },
          messaging_type: 'RESPONSE',
          message: { text: msg.body },
        }),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `${this.channel} ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { message_id?: string };
      return data.message_id
        ? { status: 'SENT', providerMessageId: data.message_id }
        : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}

/**
 * RCS via a provider gateway (Day 93) — RCS is carrier-mediated, so we post to a configured provider
 * endpoint (Google RBM / Sinch / etc.) with a bearer token. The exact URL + auth are provider-specific
 * and injected from env; the shape here is the common `{ to, text }` a gateway accepts.
 */
export class RcsSender implements MessageSender {
  readonly channel: MessageChannel = 'RCS';
  constructor(
    private readonly apiUrl: string,
    private readonly apiToken: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    try {
      const res = await this.http(this.apiUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ to: msg.to, text: msg.body }),
      });
      const text = await res.text();
      if (!res.ok) return { status: 'FAILED', error: `RCS ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { id?: string; messageId?: string };
      const id = data.id ?? data.messageId;
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}

/**
 * Build the senders that have credentials configured (gated). Returns a partial map — the
 * service treats a missing channel as "queued, not dispatched" so the app runs without keys.
 */
export function buildSenders(
  env: NodeJS.ProcessEnv,
  http: HttpClient = fetchHttp,
): Partial<Record<MessageChannel, MessageSender>> {
  const senders: Partial<Record<MessageChannel, MessageSender>> = {};
  if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
    senders.WHATSAPP = new WhatsAppSender(
      env.WHATSAPP_PHONE_NUMBER_ID,
      env.WHATSAPP_ACCESS_TOKEN,
      http,
    );
  }
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_FROM) {
    senders.SMS = new TwilioSmsSender(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_MESSAGING_FROM,
      http,
    );
  }
  // Day 93 channels — each gated on its own credentials.
  if (env.TELEGRAM_BOT_TOKEN) {
    senders.TELEGRAM = new TelegramSender(env.TELEGRAM_BOT_TOKEN, http);
  }
  if (env.MESSENGER_PAGE_ACCESS_TOKEN) {
    senders.MESSENGER = new MetaMessagingSender('MESSENGER', env.MESSENGER_PAGE_ACCESS_TOKEN, http);
  }
  if (env.INSTAGRAM_ACCESS_TOKEN) {
    senders.INSTAGRAM = new MetaMessagingSender('INSTAGRAM', env.INSTAGRAM_ACCESS_TOKEN, http);
  }
  if (env.RCS_API_URL && env.RCS_API_TOKEN) {
    senders.RCS = new RcsSender(env.RCS_API_URL, env.RCS_API_TOKEN, http);
  }
  return senders;
}
