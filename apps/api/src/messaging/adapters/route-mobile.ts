import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Route Mobile SMS via the SMSPlus Bulk HTTP API (India-first, GME-10). `POST {host}/bulksms/bulksms`,
 * form-encoded. India DLT ids (resolved per send by the GME-06 engine) map to `entityid` (PE id) +
 * `tempid` (content template id); `source` is the approved header. The reply is pipe-delimited text
 * `<code>|<destination>|<messageId>` — `1701` is success. The host is account-specific (default
 * `api.rmlconnect.net`). HTTP injected for offline tests; gated on the tenant's creds.
 *
 * Docs: https://routemobile.com/pdf_files/developer/api/SmsPlus_BulkHttp.pdf
 */
export class RouteMobileSmsSender implements MessageSender {
  readonly id = 'route-mobile';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly source: string,
    private readonly host: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const host = (this.host || 'https://api.rmlconnect.net').replace(/\/$/, '');
    const params = new URLSearchParams({
      username: this.username,
      password: this.password,
      type: '0',
      dlr: '1',
      destination: msg.to.replace(/^\+/, ''),
      source: msg.dltSender || this.source,
      message: msg.body,
      ...(msg.dltEntityId ? { entityid: msg.dltEntityId } : {}),
      ...(msg.dltTemplateId ? { tempid: msg.dltTemplateId } : {}),
    });
    try {
      const res = await this.http(`${host}/bulksms/bulksms`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `Route Mobile ${res.status}: ${text.slice(0, 200)}` };
      // Reply: <error_code>|<destination>|<message_id>. 1701 = accepted for delivery.
      const [code, , messageId] = text.trim().split('|');
      if (code === '1701') {
        return messageId ? { status: 'SENT', providerMessageId: messageId } : { status: 'SENT' };
      }
      return { status: 'FAILED', error: `Route Mobile: ${text.slice(0, 200)}` };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
