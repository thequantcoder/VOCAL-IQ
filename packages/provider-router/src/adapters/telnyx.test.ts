import { Provider, isAppError } from '@vocaliq/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelnyxNumberProvisioner, TelnyxTelephony } from './telnyx.js';

/** Build a fake `fetch` that records calls and returns a canned JSON/status per URL matcher. */
function fakeFetch(routes: Array<{ match: RegExp; status?: number; json?: unknown }>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const route = routes.find((r) => r.match.test(u));
    const status = route?.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => route?.json ?? {},
      text: async () => JSON.stringify(route?.json ?? {}),
    } as Response;
  });
  return { fn, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TelnyxNumberProvisioner', () => {
  it('searches available numbers and normalises features + cost', async () => {
    const { fn, calls } = fakeFetch([
      {
        match: /available_phone_numbers/,
        json: {
          data: [
            {
              phone_number: '+14155550100',
              cost_information: { monthly_cost: '1.00', currency: 'USD' },
              features: [{ name: 'voice' }, { name: 'sms' }, { name: 'mms' }],
              region_information: [
                { region_type: 'location', region_name: 'San Francisco' },
                { region_type: 'state', region_name: 'CA' },
              ],
            },
          ],
        },
      },
    ]);
    vi.stubGlobal('fetch', fn);

    const provisioner = new TelnyxNumberProvisioner('KEY123');
    const results = await provisioner.searchAvailable({
      country: 'us',
      areaCode: '415',
      smsEnabled: true,
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      e164: '+14155550100',
      locality: 'San Francisco',
      region: 'CA',
      country: 'US',
      capabilities: ['VOICE', 'SMS', 'MMS'],
      monthlyCostUsd: 1,
    });
    // Bearer auth + filters on the request.
    const search = calls[0]!;
    expect(search.url).toContain('filter%5Bcountry_code%5D=US');
    expect(search.url).toContain('filter%5Bnational_destination_code%5D=415');
    expect(provisioner.provider).toBe(Provider.TELNYX);
  });

  it('orders a number and returns the phone-number id as the provider SID', async () => {
    const { fn, calls } = fakeFetch([
      {
        match: /number_orders/,
        json: {
          data: {
            status: 'success',
            phone_numbers: [{ id: 'num_abc123', phone_number: '+14155550100' }],
          },
        },
      },
    ]);
    vi.stubGlobal('fetch', fn);

    const bought = await new TelnyxNumberProvisioner('KEY').purchase('+14155550100');
    expect(bought).toEqual({
      providerSid: 'num_abc123',
      e164: '+14155550100',
      capabilities: ['VOICE', 'SMS'],
    });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ phone_numbers: [{ phone_number: '+14155550100' }] });
  });

  it('throws a ProviderError when the order returns no phone-number id', async () => {
    vi.stubGlobal('fetch', fakeFetch([{ match: /number_orders/, json: { data: {} } }]).fn);
    await expect(new TelnyxNumberProvisioner('KEY').purchase('+14155550100')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'PROVIDER',
    );
  });

  it('releases a number by DELETEing the phone-number resource', async () => {
    const { fn, calls } = fakeFetch([{ match: /phone_numbers/, status: 204 }]);
    vi.stubGlobal('fetch', fn);
    await new TelnyxNumberProvisioner('KEY').release('num_abc123');
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toContain('/phone_numbers/num_abc123');
  });

  it('surfaces a ProviderError on a non-2xx carrier response', async () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch([{ match: /available_phone_numbers/, status: 401, json: { errors: ['bad key'] } }])
        .fn,
    );
    await expect(
      new TelnyxNumberProvisioner('BAD').searchAvailable({ country: 'US', limit: 3 }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');
  });
});

describe('TelnyxTelephony', () => {
  it('dials on a Call Control connection and returns the call_control_id', async () => {
    const { fn, calls } = fakeFetch([
      { match: /\/calls$/, json: { data: { call_control_id: 'cc_xyz' } } },
    ]);
    vi.stubGlobal('fetch', fn);

    const res = await new TelnyxTelephony('KEY', 'conn_1').dial('+14155550100', '+14155550111');
    expect(res).toEqual({ callId: 'cc_xyz', status: 'initiated' });
    expect(calls[0]!.body).toEqual({
      connection_id: 'conn_1',
      to: '+14155550100',
      from: '+14155550111',
    });
  });

  it('requires a connection id to dial', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(new TelnyxTelephony('KEY').dial('+14155550100', '+14155550111')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'PROVIDER',
    );
  });

  it('hangs up and transfers a live call by call_control_id', async () => {
    const { fn, calls } = fakeFetch([{ match: /actions\/(hangup|transfer)/, json: { data: {} } }]);
    vi.stubGlobal('fetch', fn);

    const tel = new TelnyxTelephony('KEY', 'conn_1');
    await tel.transfer('cc_xyz', '+14155559999');
    await tel.hangup('cc_xyz');

    expect(calls[0]!.url).toContain('/calls/cc_xyz/actions/transfer');
    expect(calls[0]!.body).toEqual({ to: '+14155559999' });
    expect(calls[1]!.url).toContain('/calls/cc_xyz/actions/hangup');
  });
});
