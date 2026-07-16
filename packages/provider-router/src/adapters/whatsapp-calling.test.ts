import { Provider, isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { whatsappCallCostUsd, whatsappCallPulses, whatsappCallRatePerMin } from '../pricing.js';
import {
  WHATSAPP_NO_PERMISSION_CODE,
  type WaHttp,
  WhatsAppCallingTelephony,
  whatsappErrorCode,
} from './whatsapp-calling.js';

/** A fake injected HTTP transport that records requests + returns a canned status/JSON per matcher. */
function fakeHttp(routes: Array<{ match: RegExp; status?: number; json?: unknown }>) {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | undefined }> =
    [];
  const fn: WaHttp = async (url, init) => {
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

const PNID = '436666719526789';
const TOKEN = 'EAAG-secret-token-should-never-leak';
const SDP = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n<opus 48000>\r\n';

function adapter(http: WaHttp) {
  return new WhatsAppCallingTelephony(TOKEN, PNID, { http });
}

describe('WhatsAppCallingTelephony — signaling', () => {
  it('placeCall (outbound) sends action=connect with the business SDP offer and returns the WACID', async () => {
    const { fn, calls } = fakeHttp([
      { match: /\/calls$/, json: { messaging_product: 'whatsapp', calls: [{ id: 'wacid.ABC' }] } },
    ]);
    const res = await adapter(fn).placeCall({
      to: '14155551234',
      sdpOffer: SDP,
      callbackData: 'x',
    });
    expect(res.waCallId).toBe('wacid.ABC');
    expect(calls[0]?.url).toBe(`https://graph.facebook.com/v21.0/${PNID}/calls`);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '14155551234',
      action: 'connect',
      session: { sdp_type: 'offer', sdp: SDP },
      biz_opaque_callback_data: 'x',
    });
  });

  it('pre_accept / accept send an SDP answer; reject + terminate send just the action', async () => {
    const { fn, calls } = fakeHttp([{ match: /\/calls$/, json: { success: true } }]);
    const a = adapter(fn);
    await a.preAccept({ callId: 'wacid.1', sdpAnswer: SDP });
    await a.accept({ callId: 'wacid.1', sdpAnswer: SDP, callbackData: 'cb' });
    await a.reject('wacid.1');
    await a.terminate('wacid.1');
    expect(calls[0]?.body).toMatchObject({
      call_id: 'wacid.1',
      action: 'pre_accept',
      session: { sdp_type: 'answer' },
    });
    expect(calls[1]?.body).toMatchObject({ action: 'accept', biz_opaque_callback_data: 'cb' });
    expect(calls[2]?.body).toMatchObject({ action: 'reject' });
    expect(calls[2]?.body).not.toHaveProperty('session');
    expect(calls[3]?.body).toMatchObject({ action: 'terminate' });
  });

  it('requires a `to` or `recipient`', async () => {
    const { fn } = fakeHttp([]);
    await expect(adapter(fn).placeCall({ sdpOffer: SDP })).rejects.toSatisfy(isAppError);
  });

  it('exposes the provider + telephony capability', () => {
    expect(adapter(fakeHttp([]).fn).provider).toBe(Provider.WHATSAPP);
    expect(adapter(fakeHttp([]).fn).capability).toBe('telephony');
  });
});

describe('WhatsAppCallingTelephony — permissions', () => {
  it('sends an interactive call_permission_request, and a template variant', async () => {
    const { fn, calls } = fakeHttp([{ match: /\/messages$/, json: {} }]);
    const a = adapter(fn);
    await a.sendCallPermissionRequest({ to: '14155551234', text: 'May we call you?' });
    await a.sendCallPermissionRequest({ recipient: 'US.999', templateName: 'wa_call_perm' });
    expect(calls[0]?.body).toMatchObject({
      type: 'interactive',
      interactive: { type: 'call_permission_request', body: { text: 'May we call you?' } },
    });
    expect(calls[1]?.body).toMatchObject({ type: 'template', template: { name: 'wa_call_perm' } });
  });

  it('parses call permission status + action limits', async () => {
    const { fn, calls } = fakeHttp([
      {
        match: /call_permissions/,
        json: {
          permission: { status: 'temporary', expiration_time: 1745343479 },
          actions: [
            {
              action_name: 'start_call',
              can_perform_action: false,
              limits: [
                {
                  time_period: 'PT24H',
                  max_allowed: 100,
                  current_usage: 100,
                  limit_expiration_time: 1745622600,
                },
              ],
            },
          ],
        },
      },
    ]);
    const perm = await adapter(fn).getCallPermission({ userWaId: '14155551234' });
    expect(perm.status).toBe('temporary');
    expect(perm.expirationTime).toBe(1745343479);
    expect(perm.actions[0]?.canPerformAction).toBe(false);
    expect(perm.actions[0]?.limits[0]).toMatchObject({ maxAllowed: 100, currentUsage: 100 });
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toContain('user_wa_id=14155551234');
  });
});

describe('WhatsAppCallingTelephony — settings + errors', () => {
  it('updates the calling settings block', async () => {
    const { fn, calls } = fakeHttp([{ match: /\/settings$/, json: { success: true } }]);
    await adapter(fn).updateSettings({ status: 'ENABLED', callback_permission_status: 'ENABLED' });
    expect(calls[0]?.body).toEqual({
      calling: { status: 'ENABLED', callback_permission_status: 'ENABLED' },
    });
  });

  it('maps Meta error 138006 to a needs-permission code, and never leaks the token or SDP', async () => {
    const { fn } = fakeHttp([
      {
        match: /\/calls$/,
        status: 400,
        json: { error: { code: 138006, message: 'no permission' } },
      },
    ]);
    let thrown: unknown;
    try {
      await adapter(fn).placeCall({ to: '14155551234', sdpOffer: SDP });
    } catch (e) {
      thrown = e;
    }
    expect(isAppError(thrown)).toBe(true);
    expect(whatsappErrorCode(thrown)).toBe(WHATSAPP_NO_PERMISSION_CODE);
    const serialized = `${(thrown as Error).message} ${(thrown as { cause?: Error }).cause?.message ?? ''}`;
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('opus');
  });
});

describe('WhatsApp call pricing', () => {
  it('bills outbound in 6-second pulses (56 s → 10 pulses)', () => {
    expect(whatsappCallPulses(56)).toBe(10);
    expect(whatsappCallPulses(6)).toBe(1);
    expect(whatsappCallPulses(0)).toBe(0);
  });

  it('inbound is always free; outbound uses per-country rate', () => {
    expect(whatsappCallCostUsd(120, 'US', 'inbound')).toBe(0);
    // 120 s outbound to US = 20 pulses = 120 billed s = 2 min × $0.010 = $0.02
    expect(whatsappCallCostUsd(120, 'US', 'outbound')).toBeCloseTo(0.02, 6);
    // unknown country falls back to DEFAULT tier0
    expect(whatsappCallRatePerMin('ZZ')).toBe(0.015);
  });

  it('crosses to the lower (tier1) rate past the monthly band', () => {
    expect(whatsappCallRatePerMin('US', 10_000)).toBe(0.01); // tier0
    expect(whatsappCallRatePerMin('US', 60_000)).toBe(0.008); // tier1
  });
});
