import { Provider, ProviderError } from '@vocaliq/shared';
import type {
  AvailableNumber,
  DialResult,
  NumberProvisioner,
  NumberSearchParams,
  PurchasedNumber,
  TelephonyProvider,
} from '../index.js';

const API_BASE = 'https://api.telnyx.com/v2';

/** Telnyx returns lowercase feature names; we normalise to VOICE/SMS/MMS to match the router. */
function normaliseFeatures(features: Array<{ name?: string }> | undefined): string[] {
  const caps: string[] = [];
  for (const f of features ?? []) {
    const name = f.name?.toLowerCase();
    if (name === 'voice') caps.push('VOICE');
    else if (name === 'sms') caps.push('SMS');
    else if (name === 'mms') caps.push('MMS');
  }
  return caps.length > 0 ? caps : ['VOICE'];
}

/** A Bearer-authenticated JSON request against the Telnyx v2 REST API. */
async function telnyxFetch(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    throw new ProviderError('Telnyx request failed', { cause });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ProviderError(`Telnyx ${method} ${path} error ${res.status}`, {
      cause: new Error(detail.slice(0, 500)),
    });
  }
  // DELETE + some actions may return an empty body.
  if (res.status === 204) return {};
  return res.json().catch(() => ({}));
}

interface TelnyxAvailable {
  phone_number: string;
  cost_information?: { monthly_cost?: string; currency?: string };
  features?: Array<{ name?: string }>;
  region_information?: Array<{ region_type?: string; region_name?: string }>;
}

/**
 * Telnyx number provisioning over the v2 REST API — search available numbers, order one (a Number
 * Order), and release it. The `providerSid` returned from `purchase` is the Telnyx phone-number
 * resource id, which is what `release` deletes. Cost is metered by the caller (golden rule #4).
 */
export class TelnyxNumberProvisioner implements NumberProvisioner {
  readonly provider = Provider.TELNYX;

  constructor(private readonly apiKey: string) {}

  async searchAvailable(params: NumberSearchParams): Promise<AvailableNumber[]> {
    const q = new URLSearchParams();
    q.set('filter[country_code]', params.country.toUpperCase());
    q.set('filter[phone_number_type]', 'local');
    q.set('filter[limit]', String(params.limit));
    if (params.areaCode) q.set('filter[national_destination_code]', params.areaCode);
    if (params.contains) q.set('filter[phone_number][contains]', params.contains);
    // Telnyx filters features additively; ask for the ones the caller wants.
    if (params.voiceEnabled !== false) q.append('filter[features]', 'voice');
    if (params.smsEnabled) q.append('filter[features]', 'sms');

    const json = (await telnyxFetch(this.apiKey, 'GET', `/available_phone_numbers?${q}`)) as {
      data?: TelnyxAvailable[];
    };
    return (json.data ?? []).map((n) => {
      const region = n.region_information?.find((r) => r.region_type === 'location')?.region_name;
      const state = n.region_information?.find((r) => r.region_type === 'state')?.region_name;
      const monthly = Number(n.cost_information?.monthly_cost);
      return {
        e164: n.phone_number,
        friendlyName: n.phone_number,
        ...(region ? { locality: region } : {}),
        ...(state ? { region: state } : {}),
        country: params.country.toUpperCase(),
        capabilities: normaliseFeatures(n.features),
        monthlyCostUsd: Number.isFinite(monthly) ? monthly : 1.0,
      };
    });
  }

  async purchase(e164: string): Promise<PurchasedNumber> {
    // A Number Order buys the number; its sub-resource carries the phone-number id used for release.
    const order = (await telnyxFetch(this.apiKey, 'POST', '/number_orders', {
      phone_numbers: [{ phone_number: e164 }],
    })) as { data?: { phone_numbers?: Array<{ id?: string; phone_number?: string }> } };

    const bought = order.data?.phone_numbers?.find((p) => p.phone_number === e164);
    if (!bought?.id) {
      throw new ProviderError('Telnyx number order did not return a phone-number id');
    }
    return { providerSid: bought.id, e164, capabilities: ['VOICE', 'SMS'] };
  }

  async release(providerSid: string): Promise<void> {
    await telnyxFetch(this.apiKey, 'DELETE', `/phone_numbers/${providerSid}`);
  }
}

/**
 * Telnyx telephony over the Call Control v2 API. `dial` places an outbound call on a Call Control
 * Connection; `transfer`/`answer`/`hangup` act on a live call by its `call_control_id` (returned as
 * `callId`). Cost is metered by the caller on call seconds at hangup — the adapter never bills.
 */
export class TelnyxTelephony implements TelephonyProvider {
  readonly provider = Provider.TELNYX;
  readonly capability = 'telephony' as const;

  /** `connectionId` is the Telnyx Call Control Connection an outbound call is placed on. */
  constructor(
    private readonly apiKey: string,
    private readonly connectionId?: string,
  ) {}

  async dial(to: string, from: string, opts?: Record<string, unknown>): Promise<DialResult> {
    const connectionId =
      (typeof opts?.connectionId === 'string' ? opts.connectionId : undefined) ?? this.connectionId;
    if (!connectionId) {
      throw new ProviderError('Telnyx dial requires a Call Control `connectionId`');
    }
    const json = (await telnyxFetch(this.apiKey, 'POST', '/calls', {
      connection_id: connectionId,
      to,
      from,
    })) as { data?: { call_control_id?: string; call_leg_id?: string } };
    const callId = json.data?.call_control_id;
    if (!callId) throw new ProviderError('Telnyx dial did not return a call_control_id');
    return { callId, status: 'initiated' };
  }

  async answer(callId: string): Promise<void> {
    await telnyxFetch(this.apiKey, 'POST', `/calls/${callId}/actions/answer`, {});
  }

  async transfer(callId: string, to: string): Promise<void> {
    await telnyxFetch(this.apiKey, 'POST', `/calls/${callId}/actions/transfer`, { to });
  }

  async hangup(callId: string): Promise<void> {
    await telnyxFetch(this.apiKey, 'POST', `/calls/${callId}/actions/hangup`, {});
  }
}
