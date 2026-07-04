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
  return senders;
}
