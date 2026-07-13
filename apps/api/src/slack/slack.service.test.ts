import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type SlackHttp, SlackService } from './slack.service';

/**
 * Slack notifications (real Postgres, RLS-scoped) with a fake HTTP transport. Proves: config
 * round-trips (URL masked on read), per-event toggles are honoured, notify posts a formatted
 * message only when enabled, a test message posts, and an unconfigured tenant is a safe no-op.
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const HOOK = 'https://hooks.slack.com/services/T000/B000/xyz';

function make() {
  const posts: { url: string; body: unknown }[] = [];
  const http: SlackHttp = async (url, init) => {
    posts.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  };
  return { svc: new SlackService(db, http), posts };
}

afterAll(async () => {
  // Reset the tenant's slack settings so the shared seed tenant is left clean.
  const t = await db.admin.tenant.findFirst({ where: { id: C1 }, select: { settings: true } });
  const settings = { ...((t?.settings as object) ?? {}) } as Record<string, unknown>;
  settings.slack = undefined;
  await db.admin.tenant.update({ where: { id: C1 }, data: { settings: settings as object } });
});

describe('SlackService', () => {
  it('is a safe no-op when not configured', async () => {
    const { svc, posts } = make();
    const res = await svc.notify(C1, 'call.completed', { callId: 'c1' });
    expect(res.delivered).toBe(false);
    expect(posts).toHaveLength(0);
  });

  it('saves config, masks the URL on read, and notifies enabled events only', async () => {
    const { svc, posts } = make();
    await svc.setConfig(C1, { webhookUrl: HOOK, events: { 'call.failed': false } });

    const cfg = await svc.getConfig(C1);
    expect(cfg.connected).toBe(true);
    expect(cfg.webhookUrl).toContain('•••'); // masked — never the full secret path
    expect(cfg.webhookUrl).not.toContain('xyz');

    // Enabled by default → posts.
    const a = await svc.notify(C1, 'call.completed', { callId: 'c1', disposition: 'ANSWERED' });
    expect(a.delivered).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe(HOOK);
    expect(JSON.stringify(posts[0]!.body)).toContain('Call completed');

    // Explicitly disabled → no post.
    const b = await svc.notify(C1, 'call.failed', { callId: 'c2' });
    expect(b.delivered).toBe(false);
    expect(posts).toHaveLength(1);
  });

  it('sends a test message when configured', async () => {
    const { svc, posts } = make();
    await svc.setConfig(C1, { webhookUrl: HOOK, events: {} });
    const res = await svc.test(C1);
    expect(res.delivered).toBe(true);
    expect(JSON.stringify(posts.at(-1)?.body)).toContain('connected');
  });

  it('rejects a non-Slack webhook URL', async () => {
    const { svc } = make();
    await expect(svc.setConfig(C1, { webhookUrl: 'https://evil.example.com/x' })).rejects.toThrow(
      /slack/i,
    );
  });
});
