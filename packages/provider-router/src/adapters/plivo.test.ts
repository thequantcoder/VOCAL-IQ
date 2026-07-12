import { Provider, isAppError } from '@vocaliq/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlivoNumberProvisioner, PlivoTelephony } from './plivo.js';

/** Fake `fetch` recording calls, returning a canned JSON/status per URL matcher. */
function fakeFetch(routes: Array<{ match: RegExp; status?: number; json?: unknown }>) {
  const calls: Array<{ url: string; method: string; body: unknown; auth: string }> = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: u,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.Authorization ?? '',
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

describe('PlivoNumberProvisioner', () => {
  it('searches available numbers, normalises E.164 + caps + cost, and uses Basic auth', async () => {
    const { fn, calls } = fakeFetch([
      {
        match: /PhoneNumber\/\?/,
        json: {
          objects: [
            {
              number: '14155550100',
              monthly_rental_rate: '0.80',
              voice_enabled: true,
              sms_enabled: true,
              mms_enabled: false,
              city: 'San Francisco',
              region: 'California',
              country: 'US',
            },
          ],
        },
      },
    ]);
    vi.stubGlobal('fetch', fn);

    const provisioner = new PlivoNumberProvisioner('AUTHID', 'AUTHTOKEN');
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
      region: 'California',
      country: 'US',
      capabilities: ['VOICE', 'SMS'],
      monthlyCostUsd: 0.8,
    });
    expect(calls[0]!.url).toContain('/Account/AUTHID/PhoneNumber/');
    expect(calls[0]!.url).toContain('country_iso=US');
    expect(calls[0]!.url).toContain('pattern=415');
    expect(calls[0]!.auth).toMatch(/^Basic /);
    expect(provisioner.provider).toBe(Provider.PLIVO);
  });

  it('buys a number (POST) and returns the E.164 as the provider SID', async () => {
    const { fn, calls } = fakeFetch([
      { match: /PhoneNumber\/14155550100\//, json: { status: 'fulfilled' } },
    ]);
    vi.stubGlobal('fetch', fn);

    const bought = await new PlivoNumberProvisioner('AUTHID', 'T').purchase('+14155550100');
    expect(bought).toEqual({
      providerSid: '+14155550100',
      e164: '+14155550100',
      capabilities: ['VOICE', 'SMS'],
    });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toContain('/PhoneNumber/14155550100/');
  });

  it('releases a number by DELETEing the Number resource (no + prefix)', async () => {
    const { fn, calls } = fakeFetch([{ match: /\/Number\//, status: 204 }]);
    vi.stubGlobal('fetch', fn);
    await new PlivoNumberProvisioner('AUTHID', 'T').release('+14155550100');
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toContain('/Account/AUTHID/Number/14155550100/');
  });

  it('surfaces a ProviderError on a non-2xx carrier response', async () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch([{ match: /PhoneNumber/, status: 401, json: { error: 'bad creds' } }]).fn,
    );
    await expect(
      new PlivoNumberProvisioner('BAD', 'BAD').searchAvailable({ country: 'US', limit: 3 }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');
  });
});

describe('PlivoTelephony', () => {
  it('dials with an answerUrl and returns the request_uuid', async () => {
    const { fn, calls } = fakeFetch([
      { match: /\/Call\/$/, json: { request_uuid: 'req_123', message: 'call fired' } },
    ]);
    vi.stubGlobal('fetch', fn);

    const res = await new PlivoTelephony('AUTHID', 'T', 'https://x/answer').dial(
      '+14155550100',
      '+14155550111',
    );
    expect(res).toEqual({ callId: 'req_123', status: 'call fired' });
    expect(calls[0]!.body).toEqual({
      from: '14155550111',
      to: '14155550100',
      answer_url: 'https://x/answer',
      answer_method: 'POST',
    });
  });

  it('requires an answerUrl to dial', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      new PlivoTelephony('AUTHID', 'T').dial('+14155550100', '+14155550111'),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');
  });

  it('hangs up (DELETE) and transfers (POST legs/aleg_url) a live call', async () => {
    const { fn, calls } = fakeFetch([{ match: /\/Call\/cc_1\//, json: {} }]);
    vi.stubGlobal('fetch', fn);

    const tel = new PlivoTelephony('AUTHID', 'T', 'https://x/answer');
    await tel.transfer('cc_1', 'https://x/transfer');
    await tel.hangup('cc_1');

    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ legs: 'aleg', aleg_url: 'https://x/transfer' });
    expect(calls[1]!.method).toBe('DELETE');
    expect(calls[1]!.url).toContain('/Call/cc_1/');
  });
});
