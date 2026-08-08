import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Vonage (Nexmo) SMS via the classic SMS API (`POST /sms/json`, form-encoded, api_key/secret). Global
 * coverage; `from` is the sender id/number. HTTP injected for offline tests; gated on the tenant's creds.
 *
 * Docs: https://developer.vonage.com/en/api/sms
 */
export class VonageSmsSender implements MessageSender {
  readonly id = 'vonage';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      from: this.from,
      to: msg.to.replace(/^\+/, ''),
      text: msg.body,
    });
    try {
      const res = await this.http('https://rest.nexmo.com/sms/json', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Vonage ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as {
        messages?: { status?: string; 'message-id'?: string; 'error-text'?: string }[];
      };
      const m = data.messages?.[0];
      if (m?.status === '0') {
        const id = m['message-id'];
        return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
      }
      return { status: 'FAILED', error: `Vonage: ${m?.['error-text'] ?? text.slice(0, 200)}` };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
