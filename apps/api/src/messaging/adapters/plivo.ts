import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Plivo SMS via the Messages API (`POST /v1/Account/{authId}/Message/`, basic auth, JSON src/dst/text).
 * Global coverage; `from` is the Plivo source number. Reuses the same Plivo carrier credentials the
 * telephony side uses. HTTP injected for offline tests; gated on the tenant's creds.
 *
 * Docs: https://www.plivo.com/docs/messaging/api/overview
 */
export class PlivoSmsSender implements MessageSender {
  readonly id = 'plivo';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly authId: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://api.plivo.com/v1/Account/${this.authId}/Message/`;
    const basic = Buffer.from(`${this.authId}:${this.authToken}`).toString('base64');
    const payload = { src: this.from, dst: msg.to.replace(/^\+/, ''), text: msg.body };
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) return { status: 'FAILED', error: `Plivo ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { message_uuid?: string[] };
      const id = data.message_uuid?.[0];
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
