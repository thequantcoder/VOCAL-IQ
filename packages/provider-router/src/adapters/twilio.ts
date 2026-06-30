import { Provider, ProviderError } from '@vocaliq/shared';
import twilio, { type Twilio } from 'twilio';
import type { DialResult, TelephonyProvider } from '../index.js';

/**
 * Twilio telephony (PSTN/SIP) over the Voice REST API. `dial` places an outbound
 * call; `transfer`/`hangup` mutate a live call; `answer` is a no-op for REST-dialled
 * calls (inbound answering is driven by the TwiML webhook, Day 11). The first real
 * outbound call is placed on Day 10 with a funded test number + budget.
 *
 * Cost is metered by the caller on call seconds at hangup (TELEPHONY_PRICES) — the
 * adapter never bills (golden rule #4 keeps metering in the Router).
 */
export class TwilioTelephony implements TelephonyProvider {
  readonly provider = Provider.TWILIO;
  readonly capability = 'telephony' as const;
  private readonly client: Twilio;

  constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
  }

  /**
   * Place an outbound call. `opts.url` (TwiML URL) or `opts.twiml` drives the call
   * media; the voice service supplies a URL that bridges the call into a LiveKit room.
   */
  async dial(to: string, from: string, opts?: Record<string, unknown>): Promise<DialResult> {
    try {
      const url = typeof opts?.url === 'string' ? opts.url : undefined;
      const twiml = typeof opts?.twiml === 'string' ? opts.twiml : undefined;
      if (!url && !twiml) {
        throw new ProviderError('Twilio dial requires a `url` (TwiML) or `twiml` instruction');
      }
      const call = await this.client.calls.create({
        to,
        from,
        ...(url ? { url } : {}),
        ...(twiml ? { twiml } : {}),
      });
      return { callId: call.sid, status: call.status };
    } catch (cause) {
      if (cause instanceof ProviderError) throw cause;
      throw new ProviderError('Twilio dial failed', { cause });
    }
  }

  /** Inbound answering is handled by the TwiML webhook (Day 11); no REST action here. */
  async answer(_callId: string): Promise<void> {
    // intentional no-op — kept to satisfy the TelephonyProvider contract.
  }

  async transfer(callId: string, to: string): Promise<void> {
    try {
      // Redirect the live call to new TwiML that <Dial>s the transfer target.
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${to}</Dial></Response>`;
      await this.client.calls(callId).update({ twiml });
    } catch (cause) {
      throw new ProviderError('Twilio transfer failed', { cause });
    }
  }

  async hangup(callId: string): Promise<void> {
    try {
      await this.client.calls(callId).update({ status: 'completed' });
    } catch (cause) {
      throw new ProviderError('Twilio hangup failed', { cause });
    }
  }
}
