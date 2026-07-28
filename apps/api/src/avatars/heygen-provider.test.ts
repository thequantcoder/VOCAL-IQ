import { isAppError } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { heygenAvatarProvider } from './avatar.service';

/**
 * Offline unit proof of the live HeyGen Streaming-Avatar provider: a stubbed `fetch` records each
 * call + returns canned responses, so we assert the new→start→stop sequence, the x-api-key auth, the
 * session_id → providerRef mapping, and that a failure raises (the service then falls back to voice).
 */

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const notOk = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

describe('heygenAvatarProvider', () => {
  it('reports ready and returns the HeyGen session id as providerRef', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).endsWith('/streaming.new') ? ok({ data: { session_id: 'sess_42' } }) : ok({}),
    ) as unknown as typeof fetch;

    const provider = heygenAvatarProvider('hk_key', fetchImpl);
    expect(provider.ready()).toBe(true);

    const started = await provider.startSession({ tenantId: 't1', providerAvatarId: 'av_9' });
    expect(started).toEqual({ providerRef: 'sess_42' });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    // new → start, in order, both with the x-api-key header.
    expect(String(calls[0]?.[0])).toBe('https://api.heygen.com/v1/streaming.new');
    expect(String(calls[1]?.[0])).toBe('https://api.heygen.com/v1/streaming.start');
    const newInit = calls[0]?.[1] as { headers: Record<string, string>; body: string };
    expect(newInit.headers['x-api-key']).toBe('hk_key');
    expect(JSON.parse(newInit.body).avatar_id).toBe('av_9');
    expect(JSON.parse((calls[1]?.[1] as { body: string }).body).session_id).toBe('sess_42');
  });

  it('stops the session on endSession', async () => {
    const fetchImpl = vi.fn(async () => ok({})) as unknown as typeof fetch;
    await heygenAvatarProvider('hk_key', fetchImpl).endSession({
      tenantId: 't1',
      providerRef: 'sess_42',
    });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(String(call[0])).toBe('https://api.heygen.com/v1/streaming.stop');
    expect(JSON.parse((call[1] as { body: string }).body).session_id).toBe('sess_42');
  });

  it('raises on a session-create failure (service then falls back to voice)', async () => {
    const bad = (async () => notOk(500)) as unknown as typeof fetch;
    await expect(
      heygenAvatarProvider('hk_key', bad).startSession({
        tenantId: 't1',
        providerAvatarId: 'av_9',
      }),
    ).rejects.toSatisfy((e) => isAppError(e));
  });

  it('raises when HeyGen returns no session id', async () => {
    const noId = (async () => ok({ data: {} })) as unknown as typeof fetch;
    await expect(
      heygenAvatarProvider('hk_key', noId).startSession({
        tenantId: 't1',
        providerAvatarId: 'av_9',
      }),
    ).rejects.toSatisfy((e) => isAppError(e));
  });
});
