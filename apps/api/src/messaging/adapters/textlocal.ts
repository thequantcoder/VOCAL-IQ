import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Textlocal India SMS via the send API (India-first, GME-10). `POST https://api.textlocal.in/send/`,
 * form-encoded `apikey/numbers/sender/message`. DLT is enforced Textlocal-side: the `sender` header
 * (DLT-registered, resolved per send by the GME-06 engine) plus a body that matches an uploaded
 * template. `numbers` carries the country code without a leading '+'. HTTP injected for offline tests;
 * gated on the tenant's creds.
 *
 * Docs: https://api.textlocal.in/docs/sendsms
 */
export class TextlocalSmsSender implements MessageSender {
  readonly id = 'textlocal';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly apiKey: string,
    private readonly sender: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const params = new URLSearchParams({
      apikey: this.apiKey,
      numbers: msg.to.replace(/^\+/, ''),
      sender: msg.dltSender || this.sender,
      message: msg.body,
    });
    try {
      const res = await this.http('https://api.textlocal.in/send/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Textlocal ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as {
        status?: string;
        messages?: { id?: string }[];
        errors?: { message?: string }[];
      };
      if (data.status === 'success') {
        const id = data.messages?.[0]?.id;
        return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
      }
      return {
        status: 'FAILED',
        error: `Textlocal: ${data.errors?.[0]?.message ?? text.slice(0, 200)}`,
      };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
