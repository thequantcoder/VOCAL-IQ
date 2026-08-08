import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Gupshup Enterprise SMS via the GatewayAPI/rest endpoint (India-first, GME-05). Uses the documented
 * plain-auth scheme (userid + password) and `format=json`; the DLT sender header comes from the
 * tenant's credentials (`mask`). India DLT (principal-entity + template ids) is enforced by the
 * GME-06 engine; here the adapter posts to the real API. HTTP is injected for offline tests; gated on
 * the tenant's Gupshup creds.
 *
 * Docs: https://docs.gupshup.io/docs/getting-started-with-sms-api
 */
export class GupshupSmsSender implements MessageSender {
  readonly id = 'gupshup';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly userId: string,
    private readonly password: string,
    private readonly sender: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = 'https://enterprise.smsgupshup.com/GatewayAPI/rest';
    const params = new URLSearchParams({
      method: 'SendMessage',
      send_to: msg.to.replace(/^\+/, ''),
      msg: msg.body,
      msg_type: 'TEXT',
      format: 'json',
      v: '1.1',
      auth_scheme: 'plain',
      userid: this.userId,
      password: this.password,
      ...(this.sender ? { mask: this.sender } : {}),
    });
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Gupshup ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as {
        response?: { status?: string; id?: string; details?: string };
      };
      const r = data.response;
      if (r?.status === 'success') {
        return r.id ? { status: 'SENT', providerMessageId: r.id } : { status: 'SENT' };
      }
      return { status: 'FAILED', error: `Gupshup: ${r?.details ?? text.slice(0, 200)}` };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
