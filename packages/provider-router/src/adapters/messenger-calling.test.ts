import { Provider, isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { messengerCallCostUsd, messengerCallPulses, messengerCallRatePerMin } from '../pricing.js';
import { type MeHttp, MessengerCallingTelephony, messengerErrorCode } from './messenger-calling.js';

/** A fake injected HTTP transport that records requests + returns a canned status/JSON per matcher. */
function fakeHttp(routes: Array<{ match: RegExp; status?: number; json?: unknown }>) {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | undefined }> =
    [];
  const fn: MeHttp = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    const route = routes.find((r) => r.match.test(url));
    const status = route?.status ?? 200;
    return {
      ok: status < 400,
      status,
      text: async () => JSON.stringify(route?.json ?? {}),
    };
  };
  return { fn, calls };
}

const TOKEN = 'EAAG-page-secret-token-should-never-leak';
const PSID = '24680135791113';
const SDP = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n<opus 48000>\r\n';

function adapter(http: MeHttp) {
  return new MessengerCallingTelephony(TOKEN, { http });
}

describe('MessengerCallingTelephony — signaling', () => {
  it('placeCall (outbound) sends action=connect to /me/calls with the Page SDP offer + PSID recipient', async () => {
    const { fn, calls } = fakeHttp([
      { match: /\/me\/calls$/, json: { calls: [{ id: 'mecid.ABC' }] } },
    ]);
    const res = await adapter(fn).placeCall({ recipient: PSID, sdpOffer: SDP, callbackData: 'x' });
    expect(res.callId).toBe('mecid.ABC');
    expect(calls[0]?.url).toBe('https://graph.facebook.com/v21.0/me/calls');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toMatchObject({
      messaging_product: 'messenger',
      recipient: { id: PSID },
      action: 'connect',
      session: { sdp_type: 'offer', sdp: SDP },
      biz_opaque_callback_data: 'x',
    });
  });

  it('accepts a flat call_id string form of the place-call response', async () => {
    const { fn } = fakeHttp([{ match: /\/me\/calls$/, json: { call_id: 'mecid.FLAT' } }]);
    const res = await adapter(fn).placeCall({ recipient: PSID, sdpOffer: SDP });
    expect(res.callId).toBe('mecid.FLAT');
  });

  it('pre_accept / accept send an SDP answer; reject + terminate send just the action', async () => {
    const { fn, calls } = fakeHttp([{ match: /\/me\/calls$/, json: { success: true } }]);
    const a = adapter(fn);
    await a.preAccept({ callId: 'mecid.1', sdpAnswer: SDP });
    await a.accept({ callId: 'mecid.1', sdpAnswer: SDP, callbackData: 'cb' });
    await a.reject('mecid.1');
    await a.terminate('mecid.1');
    expect(calls[0]?.body).toMatchObject({
      call_id: 'mecid.1',
      action: 'pre_accept',
      session: { sdp_type: 'answer' },
    });
    expect(calls[1]?.body).toMatchObject({ action: 'accept', biz_opaque_callback_data: 'cb' });
    expect(calls[2]?.body).toMatchObject({ action: 'reject' });
    expect(calls[2]?.body).not.toHaveProperty('session');
    expect(calls[3]?.body).toMatchObject({ action: 'terminate' });
  });

  it('throws when the place-call response carries no call id', async () => {
    const { fn } = fakeHttp([{ match: /\/me\/calls$/, json: { calls: [] } }]);
    await expect(adapter(fn).placeCall({ recipient: PSID, sdpOffer: SDP })).rejects.toSatisfy(
      isAppError,
    );
  });

  it('exposes the provider + telephony capability', () => {
    expect(adapter(fakeHttp([]).fn).provider).toBe(Provider.MESSENGER);
    expect(adapter(fakeHttp([]).fn).capability).toBe('telephony');
  });
});

describe('MessengerCallingTelephony — permissions + settings', () => {
  it('parses call permission status + action limits for a PSID', async () => {
    const { fn, calls } = fakeHttp([
      {
        match: /call_permissions/,
        json: {
          permission: { status: 'temporary', expiration_time: 1745343479 },
          actions: [
            {
              action_name: 'start_call',
              can_perform_action: false,
              limits: [{ time_period: 'PT24H', max_allowed: 50, current_usage: 50 }],
            },
          ],
        },
      },
    ]);
    const perm = await adapter(fn).getCallPermission({ psid: PSID });
    expect(perm.status).toBe('temporary');
    expect(perm.expirationTime).toBe(1745343479);
    expect(perm.actions[0]?.canPerformAction).toBe(false);
    expect(perm.actions[0]?.limits[0]).toMatchObject({ maxAllowed: 50, currentUsage: 50 });
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toContain(`recipient=${PSID}`);
  });

  it('updates the calling settings block', async () => {
    const { fn, calls } = fakeHttp([{ match: /\/me\/settings$/, json: { success: true } }]);
    await adapter(fn).updateSettings({ status: 'ENABLED' });
    expect(calls[0]?.body).toEqual({ calling: { status: 'ENABLED' } });
  });
});

describe('MessengerCallingTelephony — errors', () => {
  it('maps the Graph error code and never leaks the token or SDP', async () => {
    const { fn } = fakeHttp([
      { match: /\/me\/calls$/, status: 400, json: { error: { code: 100, message: 'bad' } } },
    ]);
    let thrown: unknown;
    try {
      await adapter(fn).placeCall({ recipient: PSID, sdpOffer: SDP });
    } catch (e) {
      thrown = e;
    }
    expect(isAppError(thrown)).toBe(true);
    expect(messengerErrorCode(thrown)).toBe(100);
    const serialized = `${(thrown as Error).message} ${(thrown as { cause?: Error }).cause?.message ?? ''}`;
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('opus');
  });
});

describe('Messenger call pricing (flat, free-tier default)', () => {
  it('bills in 6-second pulses (56 s → 10 pulses)', () => {
    expect(messengerCallPulses(56)).toBe(10);
    expect(messengerCallPulses(6)).toBe(1);
    expect(messengerCallPulses(0)).toBe(0);
  });

  it('defaults to $0 (free-tier) for both directions, still a valid metered path', () => {
    expect(messengerCallCostUsd(120, 'inbound')).toBe(0);
    expect(messengerCallCostUsd(120, 'outbound')).toBe(0);
    expect(messengerCallRatePerMin(0)).toBe(0);
    expect(messengerCallRatePerMin(100_000)).toBe(0);
  });
});
