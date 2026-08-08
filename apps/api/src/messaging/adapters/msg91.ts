import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * MSG91 SMS via the v5 Flow API (India-first, GME-05). India SMS is DLT-mandated, so MSG91 sends
 * through a DLT-approved "flow" (template) — `flowId` (the DLT template id) + `sender` (the approved
 * header) come from the tenant's credentials, and the message body is passed as the flow's `body`
 * variable. The full DLT template-matching engine lands in GME-06; here the adapter just posts to the
 * real API. HTTP is injected so it's unit-testable offline; gated on the tenant's MSG91 creds.
 *
 * Docs: https://api.msg91.com/apidoc/textsms/send-sms-flow.php
 */
export class Msg91SmsSender implements MessageSender {
  readonly id = 'msg91';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly authKey: string,
    private readonly sender: string,
    private readonly flowId: string,
    private readonly http: HttpClient = fetchHttp,
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = 'https://control.msg91.com/api/v5/flow/';
    // MSG91 wants the country code without a leading '+'.
    const mobiles = msg.to.replace(/^\+/, '');
    const payload = {
      flow_id: this.flowId,
      sender: this.sender,
      recipients: [{ mobiles, body: msg.body }],
    };
    try {
      const res = await this.http(url, {
        method: 'POST',
        headers: { authkey: this.authKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) return { status: 'FAILED', error: `MSG91 ${res.status}: ${text.slice(0, 200)}` };
      const data = JSON.parse(text) as { type?: string; message?: string };
      if (data.type === 'success') {
        return data.message
          ? { status: 'SENT', providerMessageId: data.message }
          : { status: 'SENT' };
      }
      return { status: 'FAILED', error: `MSG91: ${data.message ?? text.slice(0, 200)}` };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
