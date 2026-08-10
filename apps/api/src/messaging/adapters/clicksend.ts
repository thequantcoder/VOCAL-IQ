import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * ClickSend SMS via the REST v3 API (`POST /v3/sms/send`, HTTP Basic auth `username:apiKey`, JSON).
 * Global coverage; the request carries a `messages[]` batch and an optional `from` sender id. The
 * response nests the per-message id under `data.messages[].message_id`. HTTP injected for offline
 * tests; gated on the tenant's creds.
 *
 * Docs: https://developers.clicksend.com/docs/messaging/sms/other/send-sms
 */
export class ClickSendSmsSender implements MessageSender {
  readonly id = 'clicksend';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const auth = Buffer.from(`${this.username}:${this.apiKey}`).toString('base64');
    const message: Record<string, string> = { to: msg.to, body: msg.body };
    if (this.from) message.from = this.from;
    try {
      const res = await this.http('https://rest.clicksend.com/v3/sms/send', {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [message] }),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `ClickSend ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { data?: { messages?: { message_id?: string }[] } };
      const id = data.data?.messages?.[0]?.message_id;
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
