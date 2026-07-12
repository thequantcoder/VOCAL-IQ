import { Provider, ProviderError } from '@vocaliq/shared';
import type {
  AvailableNumber,
  DialResult,
  NumberProvisioner,
  NumberSearchParams,
  PurchasedNumber,
  TelephonyProvider,
} from '../index.js';

const API_BASE = 'https://api.plivo.com/v1';

/** Plivo stores numbers without a leading '+'; the rest of the platform uses E.164 with '+'. */
function toE164(plivoNumber: string): string {
  return plivoNumber.startsWith('+') ? plivoNumber : `+${plivoNumber}`;
}
function fromE164(e164: string): string {
  return e164.replace(/^\+/, '');
}

/** A Basic-authenticated JSON request against the Plivo v1 REST API. */
async function plivoFetch(
  authId: string,
  authToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const basic = Buffer.from(`${authId}:${authToken}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/Account/${authId}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    throw new ProviderError('Plivo request failed', { cause });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ProviderError(`Plivo ${method} ${path} error ${res.status}`, {
      cause: new Error(detail.slice(0, 500)),
    });
  }
  if (res.status === 204) return {};
  return res.json().catch(() => ({}));
}

interface PlivoAvailable {
  number: string;
  monthly_rental_rate?: string;
  sms_enabled?: boolean;
  voice_enabled?: boolean;
  mms_enabled?: boolean;
  region?: string;
  city?: string;
  country?: string;
}

/**
 * Plivo number provisioning over the v1 REST API — search available numbers, rent one, and release it.
 * The `providerSid` returned from `purchase` is the E.164 number itself (Plivo releases by number).
 * Cost is metered by the caller (golden rule #4) — the adapter never bills.
 */
export class PlivoNumberProvisioner implements NumberProvisioner {
  readonly provider = Provider.PLIVO;

  constructor(
    private readonly authId: string,
    private readonly authToken: string,
  ) {}

  async searchAvailable(params: NumberSearchParams): Promise<AvailableNumber[]> {
    const q = new URLSearchParams();
    q.set('country_iso', params.country.toUpperCase());
    q.set('type', 'local');
    if (params.areaCode) q.set('pattern', params.areaCode);
    else if (params.contains) q.set('pattern', params.contains);
    const services: string[] = [];
    if (params.voiceEnabled !== false) services.push('voice');
    if (params.smsEnabled) services.push('sms');
    if (services.length > 0) q.set('services', services.join(','));

    const json = (await plivoFetch(this.authId, this.authToken, 'GET', `/PhoneNumber/?${q}`)) as {
      objects?: PlivoAvailable[];
    };
    return (json.objects ?? []).slice(0, params.limit).map((n) => {
      const caps: string[] = [];
      if (n.voice_enabled) caps.push('VOICE');
      if (n.sms_enabled) caps.push('SMS');
      if (n.mms_enabled) caps.push('MMS');
      const monthly = Number(n.monthly_rental_rate);
      return {
        e164: toE164(n.number),
        friendlyName: toE164(n.number),
        ...(n.city ? { locality: n.city } : {}),
        ...(n.region ? { region: n.region } : {}),
        country: (n.country ?? params.country).toUpperCase(),
        capabilities: caps.length > 0 ? caps : ['VOICE'],
        monthlyCostUsd: Number.isFinite(monthly) ? monthly : 0.8,
      };
    });
  }

  async purchase(e164: string): Promise<PurchasedNumber> {
    const number = fromE164(e164);
    await plivoFetch(this.authId, this.authToken, 'POST', `/PhoneNumber/${number}/`);
    // Plivo releases by the number itself — use the E.164 as the provider SID.
    return { providerSid: e164, e164, capabilities: ['VOICE', 'SMS'] };
  }

  async release(providerSid: string): Promise<void> {
    const number = fromE164(providerSid);
    await plivoFetch(this.authId, this.authToken, 'DELETE', `/Number/${number}/`);
  }
}

/**
 * Plivo telephony over the v1 Voice API. `dial` places an outbound call driven by an `answerUrl`
 * (Plivo XML) — mirroring Twilio's `url`. Plivo returns a `request_uuid` at fire time (the live
 * `call_uuid` arrives via callbacks); `transfer`/`hangup` act on the `call_uuid`. Cost is metered by
 * the caller on call seconds at hangup — the adapter never bills.
 */
export class PlivoTelephony implements TelephonyProvider {
  readonly provider = Provider.PLIVO;
  readonly capability = 'telephony' as const;

  constructor(
    private readonly authId: string,
    private readonly authToken: string,
    /** Default Plivo XML URL that drives answered-call media (per-call override via opts.answerUrl). */
    private readonly answerUrl?: string,
  ) {}

  async dial(to: string, from: string, opts?: Record<string, unknown>): Promise<DialResult> {
    const answerUrl =
      (typeof opts?.answerUrl === 'string' ? opts.answerUrl : undefined) ??
      (typeof opts?.url === 'string' ? opts.url : undefined) ??
      this.answerUrl;
    if (!answerUrl) {
      throw new ProviderError('Plivo dial requires an `answerUrl` (Plivo XML)');
    }
    const json = (await plivoFetch(this.authId, this.authToken, 'POST', '/Call/', {
      from: fromE164(from),
      to: fromE164(to),
      answer_url: answerUrl,
      answer_method: 'POST',
    })) as { request_uuid?: string; message?: string };
    if (!json.request_uuid) throw new ProviderError('Plivo dial did not return a request_uuid');
    return { callId: json.request_uuid, status: json.message ?? 'call fired' };
  }

  async answer(_callId: string): Promise<void> {
    // Inbound answering is driven by the Plivo XML answer webhook; no REST action here.
  }

  async transfer(callId: string, to: string): Promise<void> {
    // Transfer the A-leg to new Plivo XML that dials the target.
    await plivoFetch(this.authId, this.authToken, 'POST', `/Call/${callId}/`, {
      legs: 'aleg',
      aleg_url: to,
    });
  }

  async hangup(callId: string): Promise<void> {
    await plivoFetch(this.authId, this.authToken, 'DELETE', `/Call/${callId}/`);
  }
}
