import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Kaleyra SMS via the v1 messages API (India-first, GME-10). `POST https://<domain>/v1/<sid>/messages`
 * with an `api-key` header + JSON body. India is DLT-mandated, so the DLT template id (resolved per
 * send by the GME-06 engine) is stamped as `template_id` and the approved header as `sender`. The api
 * domain is region-specific (India = `api.in.kaleyra.io`). HTTP injected for offline tests; gated on
 * the tenant's creds.
 *
 * Docs: https://developers.kaleyra.io/docs/send-your-first-sms
 */
export class KaleyraSmsSender implements MessageSender {
  readonly id = 'kaleyra';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly apiKey: string,
    private readonly sid: string,
    private readonly sender: string,
    private readonly apiDomain: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const domain = this.apiDomain || 'api.in.kaleyra.io';
    const url = `https://${domain}/v1/${this.sid}/messages`;
    const templateId = msg.dltTemplateId;
    const payload = {
      to: msg.to,
      sender: msg.dltSender || this.sender,
      type: 'TXN',
      body: msg.body,
      ...(templateId ? { template_id: templateId } : {}),
    };
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { 'api-key': this.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Kaleyra ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { id?: string; data?: { message_id?: string }[] };
      const id = data.id ?? data.data?.[0]?.message_id;
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
