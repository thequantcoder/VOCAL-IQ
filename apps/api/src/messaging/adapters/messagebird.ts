import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * MessageBird (Bird) SMS via the REST Messages API (`POST /messages`, `Authorization: AccessKey …`,
 * form-encoded). Global coverage; `originator` is the sender id/number. HTTP injected for offline
 * tests; gated on the tenant's creds.
 *
 * Docs: https://developers.messagebird.com/api/sms-messaging/
 */
export class MessageBirdSmsSender implements MessageSender {
  readonly id = 'messagebird';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly accessKey: string,
    private readonly from: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const params = new URLSearchParams({
      originator: this.from,
      recipients: msg.to.replace(/^\+/, ''),
      body: msg.body,
    });
    try {
      const res = await this.http('https://rest.messagebird.com/messages', {
        method: 'POST',
        headers: {
          authorization: `AccessKey ${this.accessKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `MessageBird ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { id?: string };
      return data.id ? { status: 'SENT', providerMessageId: data.id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
