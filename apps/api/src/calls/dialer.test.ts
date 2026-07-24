import { describe, expect, it } from 'vitest';
import { type DialRequest, HttpDialer } from './dialer';

/**
 * Offline unit proof of the live HttpDialer: a stubbed `fetch` records the request and returns
 * a canned response, so we assert the exact voice endpoint, form + secret, and the fail-soft
 * behaviour (a voice hiccup never throws into placeCall) without touching the network.
 */

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function stubFetch(result: { ok?: boolean; status?: number } | { throws: true }) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: unknown, init: RequestInit | undefined) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    if ('throws' in result) throw new Error('voice unreachable');
    return { ok: result.ok ?? true, status: result.status ?? 200 } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const req: DialRequest = {
  tenantId: 't1',
  callId: 'c1',
  agentId: 'a1',
  to: '+15551234567',
  from: '+15559876543',
};

describe('HttpDialer', () => {
  it('POSTs the vetted call to the voice /calls/dial endpoint with the internal secret', async () => {
    const { fetchImpl, calls } = stubFetch({ ok: true });
    await new HttpDialer({
      voiceServiceUrl: 'http://voice:8000',
      internalSecret: 'sek',
      fetchImpl,
    }).dial(req);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('http://voice:8000/calls/dial');
    expect(call?.method).toBe('POST');
    expect(call?.headers['x-internal-secret']).toBe('sek');
    const body = JSON.parse(call?.body ?? '{}');
    expect(body).toMatchObject({
      call_id: 'c1',
      tenant_id: 't1',
      agent_id: 'a1',
      to: '+15551234567',
      from: '+15559876543',
    });
  });

  it('is fail-soft on a non-2xx (logs via onError, never throws)', async () => {
    const { fetchImpl } = stubFetch({ ok: false, status: 503 });
    const errors: string[] = [];
    await expect(
      new HttpDialer({
        voiceServiceUrl: 'http://voice:8000',
        internalSecret: 'sek',
        fetchImpl,
        onError: (m) => errors.push(m),
      }).dial(req),
    ).resolves.toBeUndefined();
    expect(errors[0]).toContain('503');
  });

  it('is fail-soft on an unreachable voice service (never throws)', async () => {
    const { fetchImpl } = stubFetch({ throws: true });
    const errors: string[] = [];
    await expect(
      new HttpDialer({
        voiceServiceUrl: 'http://voice:8000',
        internalSecret: 'sek',
        fetchImpl,
        onError: (m) => errors.push(m),
      }).dial(req),
    ).resolves.toBeUndefined();
    expect(errors[0]).toContain('failed');
  });
});
