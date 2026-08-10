import { describe, expect, it } from 'vitest';
import { type UpdateHttp, UpdateService, resolveAppVersion } from './update.service';

/** A fake HTTP transport returning a fixed JSON body (offline, deterministic). */
const okHttp =
  (body: unknown): UpdateHttp =>
  async () => ({ ok: true, json: async () => body });

describe('UpdateService.check', () => {
  it('reports an available update from a newer manifest', async () => {
    const svc = new UpdateService(
      '1.1.0',
      'https://example.com/releases.json',
      okHttp({ latest: '1.2.0', notes: 'New voices', url: 'https://x/changelog' }),
    );
    const s = await svc.check();
    expect(s.updateAvailable).toBe(true);
    expect(s.latest).toBe('1.2.0');
    expect(s.notes).toBe('New voices');
    expect(s.reachable).toBe(true);
  });

  it('reports up to date when installed >= latest', async () => {
    const svc = new UpdateService('1.2.0', 'https://x', okHttp({ latest: '1.2.0' }));
    expect((await svc.check()).updateAvailable).toBe(false);
  });

  it('degrades gracefully when the manifest fetch throws (no console break)', async () => {
    const svc = new UpdateService('1.1.0', 'https://x', async () => {
      throw new Error('network down');
    });
    const s = await svc.check();
    expect(s.reachable).toBe(false);
    expect(s.updateAvailable).toBe(false);
    expect(s.current).toBe('1.1.0');
  });

  it('degrades when no manifest URL is configured (hosted SaaS unaffected)', async () => {
    const svc = new UpdateService('1.1.0', undefined);
    expect((await svc.check()).reachable).toBe(false);
  });

  it('ignores a malformed manifest (missing latest)', async () => {
    const svc = new UpdateService('1.1.0', 'https://x', okHttp({ notes: 'no latest field' }));
    expect((await svc.check()).reachable).toBe(false);
  });

  it('handles a non-2xx response as unreachable', async () => {
    const svc = new UpdateService('1.1.0', 'https://x', async () => ({
      ok: false,
      json: async () => ({}),
    }));
    expect((await svc.check()).reachable).toBe(false);
  });
});

describe('resolveAppVersion', () => {
  it('prefers APP_VERSION, else the fallback', () => {
    expect(resolveAppVersion({ APP_VERSION: '2.0.0' } as NodeJS.ProcessEnv, '0.0.0')).toBe('2.0.0');
    expect(resolveAppVersion({} as NodeJS.ProcessEnv, '1.1.0')).toBe('1.1.0');
    expect(resolveAppVersion({ APP_VERSION: '  ' } as NodeJS.ProcessEnv, '1.1.0')).toBe('1.1.0');
  });
});
