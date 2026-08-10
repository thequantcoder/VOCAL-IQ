import { Provider, ProviderError } from '@vocaliq/shared';
import twilio, { type Twilio } from 'twilio';
import type {
  AvailableNumber,
  DialResult,
  NumberProvisioner,
  NumberSearchParams,
  PurchasedNumber,
  TelephonyProvider,
} from '../index.js';

/** Flat monthly-cost estimates by ISO country (Twilio's search list omits price). */
const MONTHLY_COST_USD: Record<string, number> = { US: 1.15, CA: 1.15, GB: 1.0, AU: 3.0 };
const DEFAULT_MONTHLY_COST_USD = 1.5;

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

/**
 * Twilio number provisioning over the REST API — search available local numbers, buy one (into the
 * account's IncomingPhoneNumbers), and release it. The provider SID returned from `purchase` is what
 * lets us `release` later. Cost is metered by the caller on the estimated monthly price.
 */
export class TwilioNumberProvisioner implements NumberProvisioner {
  readonly provider = Provider.TWILIO;
  private readonly client: Twilio;

  constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
  }

  async searchAvailable(params: NumberSearchParams): Promise<AvailableNumber[]> {
    try {
      const country = params.country.toUpperCase();
      const list = await this.client.availablePhoneNumbers(country).local.list({
        ...(params.areaCode ? { areaCode: Number(params.areaCode) } : {}),
        ...(params.contains ? { contains: params.contains } : {}),
        ...(params.smsEnabled !== undefined ? { smsEnabled: params.smsEnabled } : {}),
        ...(params.voiceEnabled !== undefined ? { voiceEnabled: params.voiceEnabled } : {}),
        limit: params.limit,
      });
      const cost = MONTHLY_COST_USD[country] ?? DEFAULT_MONTHLY_COST_USD;
      return list.map((n) => {
        const caps: string[] = [];
        if (n.capabilities?.voice) caps.push('VOICE');
        if (n.capabilities?.sms) caps.push('SMS');
        if (n.capabilities?.mms) caps.push('MMS');
        return {
          e164: n.phoneNumber,
          friendlyName: n.friendlyName ?? n.phoneNumber,
          ...(n.locality ? { locality: n.locality } : {}),
          ...(n.region ? { region: n.region } : {}),
          country,
          capabilities: caps,
          monthlyCostUsd: cost,
        };
      });
    } catch (cause) {
      throw new ProviderError('Twilio number search failed', { cause });
    }
  }

  async purchase(e164: string): Promise<PurchasedNumber> {
    try {
      const num = await this.client.incomingPhoneNumbers.create({ phoneNumber: e164 });
      const caps: string[] = [];
      if (num.capabilities?.voice) caps.push('VOICE');
      if (num.capabilities?.sms) caps.push('SMS');
      if (num.capabilities?.mms) caps.push('MMS');
      return { providerSid: num.sid, e164: num.phoneNumber, capabilities: caps };
    } catch (cause) {
      throw new ProviderError('Twilio number purchase failed', { cause });
    }
  }

  async release(providerSid: string): Promise<void> {
    try {
      await this.client.incomingPhoneNumbers(providerSid).remove();
    } catch (cause) {
      throw new ProviderError('Twilio number release failed', { cause });
    }
  }
}
