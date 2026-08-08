import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Infobip SMS via the advanced text API (`POST {base}/sms/2/text/advanced`, `Authorization: App …`,
 * JSON). Global coverage; also does RCS (flagged for GME-12). The base URL is account-specific. HTTP
 * injected for offline tests; gated on the tenant's creds.
 *
 * Docs: https://www.infobip.com/docs/api/channels/sms/outbound-sms/send-sms-message
 */
export class InfobipSmsSender implements MessageSender {
  readonly id = 'infobip';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/sms/2/text/advanced`;
    const payload = {
      messages: [
        { from: this.from, destinations: [{ to: msg.to.replace(/^\+/, '') }], text: msg.body },
      ],
    };
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { authorization: `App ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Infobip ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { messages?: { messageId?: string }[] };
      const id = data.messages?.[0]?.messageId;
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
