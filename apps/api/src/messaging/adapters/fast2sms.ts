import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Fast2SMS via the bulkV2 API on the `dlt_manual` route (India-only, GME-10). `dlt_manual` sends the
 * full rendered message text (matched against a DLT-approved template) — so the GME-06 engine's
 * resolved `entity_id` (PE id) + `template_id` + `sender_id` are stamped per send. `numbers` is the
 * bare 10-digit Indian mobile (no country code). Auth is the API key in the `authorization` header.
 * HTTP injected for offline tests; gated on the tenant's creds.
 *
 * Docs: https://docs.fast2sms.com/reference/dlt-manager + https://www.fast2sms.com/help/bulk-sms-api-india/
 */
export class Fast2SmsSender implements MessageSender {
  readonly id = 'fast2sms';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly apiKey: string,
    private readonly senderId: string,
    private readonly entityId: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const numbers = msg.to.replace(/^\+91/, '').replace(/^\+/, '');
    const entityId = msg.dltEntityId || this.entityId;
    const params = new URLSearchParams({
      route: 'dlt_manual',
      sender_id: msg.dltSender || this.senderId,
      message: msg.body,
      numbers,
      ...(entityId ? { entity_id: entityId } : {}),
      ...(msg.dltTemplateId ? { template_id: msg.dltTemplateId } : {}),
    });
    try {
      const res = await this.http('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: this.apiKey,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Fast2SMS ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as {
        return?: boolean;
        request_id?: string;
        message?: string[];
      };
      if (data.return === true) {
        return data.request_id
          ? { status: 'SENT', providerMessageId: data.request_id }
          : { status: 'SENT' };
      }
      return {
        status: 'FAILED',
        error: `Fast2SMS: ${data.message?.join('; ') ?? text.slice(0, 200)}`,
      };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
