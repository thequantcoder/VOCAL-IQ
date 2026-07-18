import { describe, expect, it, vi } from 'vitest';
import { HttpMeMediaControl } from './messenger-media-control';

/**
 * MEC-03 api→voice media control (HTTP client). Fetch is injected — no network. Verifies the request
 * shape + auth header, that a good answer is returned, and that every failure mode fails SOFT (null),
 * so the webhook path never throws (the call just stays `connecting`).
 */
function control(fetchImpl: typeof fetch) {
  return new HttpMeMediaControl({
    voiceServiceUrl: 'http://voice:8000',
    internalSecret: 's3cret',
    fetchImpl,
  });
}

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const notOk = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

describe('HttpMeMediaControl', () => {
  it('POSTs the offer to the Messenger bridge with the internal secret and returns the SDP answer', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ sdp_answer: 'v=0\r\n(answer)' }),
    ) as unknown as typeof fetch;
    const answer = await control(fetchImpl).requestSdpAnswer({
      tenantId: 't1',
      callId: 'mecid.1',
      sdpOffer: 'v=0\r\n(offer)',
      agentId: 'a1',
    });
    expect(answer).toBe('v=0\r\n(answer)');

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    const url = call[0] as string;
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(url).toBe('http://voice:8000/calls/messenger/answer');
    expect(init.method).toBe('POST');
    expect(init.headers['x-internal-secret']).toBe('s3cret');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      call_id: 'mecid.1',
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
    const answer = await control((async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch).requestSdpAnswer({
      tenantId: 't1',
      callId: 'c',
      sdpOffer: 'v=0',
    });
    expect(answer).toBeNull();
  });

  it('never leaks the SDP or the internal secret in the request URL', async () => {
    const fetchImpl = vi.fn(async () => ok({})) as unknown as typeof fetch;
    await control(fetchImpl).endCall('mecid.9');
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(call[0]).toBe('http://voice:8000/calls/messenger/end');
    expect(String(call[0])).not.toContain('s3cret');
  });
});
