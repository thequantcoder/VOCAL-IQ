import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Bandwidth SMS via the Messaging v2 API (`POST /api/v2/users/{accountId}/messages`, HTTP Basic auth,
 * JSON). US/Canada CPaaS carrier; `applicationId` ties the number to a messaging application and
 * `from` is the sending number. Returns a `202 Accepted` with a message `id`. HTTP injected for
 * offline tests; gated on the tenant's creds.
 *
 * Docs: https://dev.bandwidth.com/docs/messaging/createMessage/
 */
export class BandwidthSmsSender implements MessageSender {
  readonly id = 'bandwidth';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly accountId: string,
    private readonly applicationId: string,
    private readonly username: string,
    private readonly password: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://messaging.bandwidth.com/api/v2/users/${this.accountId}/messages`;
    const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    const payload = {
      applicationId: this.applicationId,
      to: [msg.to],
      from: this.from,
      text: msg.body,
    };
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Bandwidth ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { id?: string };
      return data.id ? { status: 'SENT', providerMessageId: data.id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
