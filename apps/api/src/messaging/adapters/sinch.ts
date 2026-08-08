import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Sinch SMS via the XMS batches API (`POST /xms/v1/{servicePlanId}/batches`, Bearer, JSON). Global
 * coverage; also does RCS (flagged for GME-12). HTTP injected for offline tests; gated on tenant creds.
 *
 * Docs: https://developers.sinch.com/docs/sms/api-reference
 */
export class SinchSmsSender implements MessageSender {
  readonly id = 'sinch';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly servicePlanId: string,
    private readonly token: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://us.sms.api.sinch.com/xms/v1/${this.servicePlanId}/batches`;
    const payload = { from: this.from, to: [msg.to], body: msg.body };
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) return { status: 'FAILED', error: `Sinch ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { id?: string };
      return data.id ? { status: 'SENT', providerMessageId: data.id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
