import { describe, expect, it, vi } from 'vitest';
import { VocalIQClient, VocalIQError } from './index.js';

/** SDK smoke tests (Day 48) with an injected fetch — no network. */

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('VocalIQClient', () => {
  it('requires an api key', () => {
    expect(() => new VocalIQClient({ apiKey: '' })).toThrow(/apiKey is required/);
  });

  it('attaches the bearer key and calls the right path', async () => {
    const fetch = fakeFetch(200, [{ id: 'a1', name: 'Ada' }]);
    const vq = new VocalIQClient({ apiKey: 'vq_live_test', baseUrl: 'https://x.dev/', fetch });
    const agents = await vq.agents.list();
    expect(agents[0]).toMatchObject({ id: 'a1' });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('https://x.dev/v1/agents');
    expect(init.headers.authorization).toBe('Bearer vq_live_test');
  });

  it('whoami returns tenant + scopes', async () => {
    const fetch = fakeFetch(200, { tenantId: 't1', scopes: ['agents:read'] });
    const vq = new VocalIQClient({ apiKey: 'k', fetch });
    expect((await vq.whoami()).tenantId).toBe('t1');
  });

  it('throws a typed VocalIQError on a non-2xx', async () => {
    const fetch = fakeFetch(401, { error: { message: 'Invalid API key' } });
    const vq = new VocalIQClient({ apiKey: 'bad', fetch });
    await expect(vq.agents.list()).rejects.toBeInstanceOf(VocalIQError);
  });
});
