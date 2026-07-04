import { createHmac } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type WebhookHttp, WebhookService } from './webhook.service';

/**
 * Outbound webhooks (Day 48) against real Postgres + RLS. Proves: SSRF-guarded registration,
 * a signed delivery (verifiable HMAC), retry-then-success, dead-letter after max attempts
 * (audited), and tenant isolation (self-audit C + B).
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const ids: string[] = [];

// Programmable fake HTTP: succeeds/fails per a queue of results.
let queue: boolean[] = [];
const seen: { headers: Record<string, string>; body: string }[] = [];
const http: WebhookHttp = vi.fn(async (_url, init) => {
  seen.push({ headers: init.headers, body: init.body });
  const okNext = queue.shift();
  return okNext ? { ok: true, status: 200 } : { ok: false, status: 500 };
});
const svc = new WebhookService(db, http, () => 1_700_000_000_000);

afterAll(async () => {
  await db.admin.auditLog.deleteMany({ where: { tenantId: C1, action: 'webhook.dead_letter' } });
  await db.admin.webhook.deleteMany({ where: { id: { in: ids } } });
});

async function register(events = ['call.completed'], secret = 'whsec_test_1234') {
  const w = await svc.register(C1, { url: 'https://hooks.example.com/vq', events, secret });
  ids.push(w.id);
  return w;
}

describe('WebhookService.register', () => {
  it('SSRF-guards the URL and requires a valid event', async () => {
    await expect(
      svc.register(C1, { url: 'http://169.254.169.254/x', events: ['call.completed'] }),
    ).rejects.toThrow(/Unsafe webhook URL/);
    await expect(
      svc.register(C1, { url: 'https://ok.example.com', events: ['bogus'] }),
    ).rejects.toThrow(/valid event/);
  });

  it('returns the secret once and never in list', async () => {
    const w = await register();
    expect(w.secret).toBe('whsec_test_1234');
    expect(JSON.stringify(await svc.list(C1))).not.toContain('whsec_test_1234');
  });
});

describe('WebhookService.deliver', () => {
  it('signs the payload verifiably and delivers on the first try', async () => {
    seen.length = 0;
    queue = [true];
    await register(['lead.created'], 'whsec_sign_me');
    const res = await svc.deliver(C1, 'lead.created', { leadId: 'abc' });
    const target = res.find((r) => r.delivered);
    expect(target?.delivered).toBe(true);
    expect(target?.attempts).toBe(1);

    // The signature header verifies with the secret over "timestamp.body".
    const call = seen.at(-1)!;
    const ts = call.headers['X-VocalIQ-Timestamp'];
    const expected = `sha256=${createHmac('sha256', 'whsec_sign_me').update(`${ts}.${call.body}`).digest('hex')}`;
    expect(call.headers['X-VocalIQ-Signature']).toBe(expected);
  });

  it('retries a failing endpoint then succeeds', async () => {
    queue = [false, true]; // fail once, then succeed
    await register(['call.failed'], 'whsec_retry');
    const res = await svc.deliver(C1, 'call.failed', { callId: 'x' });
    const target = res.find((r) => r.attempts === 2);
    expect(target?.delivered).toBe(true);
    expect(target?.attempts).toBe(2);
  });

  it('dead-letters after 3 failed attempts and audits it', async () => {
    queue = [false, false, false, false, false, false]; // enough failures for all subscribers
    const w = await register(['campaign.finished'], 'whsec_dl');
    const res = await svc.deliver(C1, 'campaign.finished', { campaignId: 'c' });
    const mine = res.find((r) => r.webhookId === w.id);
    expect(mine?.delivered).toBe(false);
    expect(mine?.attempts).toBe(3);
    expect(mine?.deadLettered).toBe(true);

    const audits = await db.admin.auditLog.findMany({
      where: { tenantId: C1, action: 'webhook.dead_letter', target: w.id },
    });
    expect(audits.length).toBeGreaterThan(0);
  });
});
