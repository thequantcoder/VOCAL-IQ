import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Telnyx SMS via the v2 Messages API (`POST /v2/messages`, Bearer, JSON from/to/text). Global
 * coverage; `from` is the Telnyx source number (or messaging-profile number). Reuses the same Telnyx
 * API key the telephony side uses. HTTP injected for offline tests; gated on the tenant's creds.
 *
 * Docs: https://developers.telnyx.com/docs/messaging/messages/send-message
 */
export class TelnyxSmsSender implements MessageSender {
  readonly id = 'telnyx';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const payload = { from: this.from, to: msg.to, text: msg.body };
    try {
      const res = await this.http('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Telnyx ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { data?: { id?: string } };
      const id = data.data?.id;
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
