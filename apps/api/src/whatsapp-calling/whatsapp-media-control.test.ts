import { describe, expect, it, vi } from 'vitest';
import { HttpWaMediaControl } from './whatsapp-media-control';

/**
 * WAC-03 api→voice media control (HTTP client). Fetch is injected — no network. Verifies the request
 * shape + auth header, that a good answer is returned, and that every failure mode fails SOFT (null),
 * so the webhook path never throws (the call just stays `connecting`).
 */
function control(fetchImpl: typeof fetch) {
  return new HttpWaMediaControl({
    voiceServiceUrl: 'http://voice:8000',
    internalSecret: 's3cret',
    fetchImpl,
  });
}

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const notOk = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

describe('HttpWaMediaControl', () => {
  it('POSTs the offer with the internal secret and returns the SDP answer', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ sdp_answer: 'v=0\r\n(answer)' }),
    ) as unknown as typeof fetch;
    const answer = await control(fetchImpl).requestSdpAnswer({
      tenantId: 't1',
      callId: 'wacid.1',
      sdpOffer: 'v=0\r\n(offer)',
      agentId: 'a1',
    });
    expect(answer).toBe('v=0\r\n(answer)');

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    const url = call[0] as string;
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(url).toBe('http://voice:8000/calls/whatsapp/answer');
    expect(init.method).toBe('POST');
    expect(init.headers['x-internal-secret']).toBe('s3cret');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      call_id: 'wacid.1',
      sdp_offer: 'v=0\r\n(offer)',
      tenant_id: 't1',
      agent_id: 'a1',
    });
  });

  it('returns null when the bridge is gated (503) — call stays connecting', async () => {
    const answer = await control((async () =>
      notOk(503)) as unknown as typeof fetch).requestSdpAnswer({
      tenantId: 't1',
      callId: 'c',
      sdpOffer: 'v=0',
    });
    expect(answer).toBeNull();
  });

  it('returns null (never throws) when the voice service is unreachable', async () => {
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(
      control(boom).requestSdpAnswer({ tenantId: 't1', callId: 'c', sdpOffer: 'v=0' }),
    ).resolves.toBeNull();
  });

  it('returns null when the response has no sdp_answer', async () => {
    const answer = await control((async () => ok({})) as unknown as typeof fetch).requestSdpAnswer({
      tenantId: 't1',
      callId: 'c',
      sdpOffer: 'v=0',
    });
    expect(answer).toBeNull();
  });

  it('WAC-11: does NOT forward a video request while video is not GA (audio-only)', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ sdp_answer: 'v=0\r\n(answer)' }),
    ) as unknown as typeof fetch;
    await control(fetchImpl).requestSdpAnswer({
      tenantId: 't1',
      callId: 'c',
      sdpOffer: 'v=0',
      video: true, // requested, but Meta hasn't GA'd video → must stay audio-only
    });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    const sent = JSON.parse((call[1] as { body: string }).body);
    expect(sent.video).toBeUndefined();
  });

  it('endCall posts to /end and swallows failures', async () => {
    const fetchImpl = vi.fn(async () => ok({ ok: true })) as unknown as typeof fetch;
    await control(fetchImpl).endCall('wacid.9');
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(call[0]).toBe('http://voice:8000/calls/whatsapp/end');
    expect(JSON.parse((call[1] as { body: string }).body)).toEqual({ call_id: 'wacid.9' });
  });
});
