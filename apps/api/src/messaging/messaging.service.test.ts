import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { RateLimiter } from '../widget/rate-limiter';
import type { DltResolver } from './dlt.service';
import { type MessagingCredsResolver, MessagingService } from './messaging.service';
import type { ProviderFactory } from './provider-factory';
import type { MessageRouter } from './routing';
import type { MessageSender, SendResult } from './senders';

/**
 * Messaging (Day 44) against real Postgres + RLS. Proves: template CRUD + send (with variable
 * substitution, cost metering, opt-out refusal, missing-var refusal), inbound opt-out/opt-in
 * suppression, status updates, gated behaviour (no sender → queued), and — the headline
 * (self-audit B) — a child tenant never sees another tenant's templates/messages.
 */

const db = new PrismaService();

const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';

// A fake SMS sender that always succeeds — lets us test the dispatch path without Twilio.
const sent: { to: string; body: string }[] = [];
const fakeSms: MessageSender = {
  id: 'twilio',
  channel: 'SMS',
  send: vi.fn(async (m): Promise<SendResult> => {
    sent.push({ to: m.to, body: m.body });
    return { status: 'SENT', providerMessageId: `SM_${sent.length}` };
  }),
};
// SMS (provider 'twilio') resolves to a fake provider; every other channel is gated (no creds → QUEUED).
const fakeResolver: MessagingCredsResolver = {
  resolve: async (_tenantId, providerId) =>
    providerId === 'twilio'
      ? {
          providerId: 'twilio',
          creds: { accountSid: 'AC', authToken: 'x', from: '+1' },
          mode: 'managed',
        }
      : null,
};
const fakeFactory: ProviderFactory = () => fakeSms;
const svc = new MessagingService(db, fakeResolver, { providerFactory: fakeFactory });

const templateIds: string[] = [];

afterAll(async () => {
  await db.admin.message.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.messagingOptOut.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.messageTemplate.deleteMany({ where: { id: { in: templateIds } } });
  await db.admin.usageRecord.deleteMany({
    where: { tenantId: { in: [C1, R1] }, capability: 'messaging' },
  });
});

let smsTemplateId: string;

beforeAll(async () => {
  const t = await svc.createTemplate(C1, {
    channel: 'SMS',
    name: 'appt_reminder',
    language: 'en',
    category: 'utility',
    body: 'Hi {{name}}, your appointment is {{time}}.',
    active: true,
  });
  smsTemplateId = t.id;
  templateIds.push(t.id);
});

describe('MessagingService templates', () => {
  it('extracts variables and lists tenant-scoped templates', async () => {
    const list = await svc.listTemplates(C1);
    const t = list.find((x) => x.id === smsTemplateId);
    expect(t?.variables.sort()).toEqual(['name', 'time']);
    // A child never sees a template created for the parent.
    const parentT = await svc.createTemplate(R1, {
      channel: 'SMS',
      name: 'parent_tpl',
      language: 'en',
      category: 'utility',
      body: 'secret {{x}}',
      active: true,
    });
    templateIds.push(parentT.id);
    expect((await svc.listTemplates(C1)).some((x) => x.id === parentT.id)).toBe(false);
  });
});

describe('MessagingService.send', () => {
  it('renders a template, meters cost, dispatches and persists', async () => {
    const msg = await svc.send(C1, {
      channel: 'SMS',
      to: '+15551230000',
      templateId: smsTemplateId,
      variables: { name: 'Sam', time: 'Tuesday 3pm' },
    });
    expect(msg.body).toBe('Hi Sam, your appointment is Tuesday 3pm.');
    expect(msg.status).toBe('SENT');
    expect(msg.costUsd).toBeGreaterThan(0);
    expect(sent.at(-1)?.body).toContain('Sam');
  });

  it('refuses to send with a missing template variable (never ships {{var}})', async () => {
    await expect(
      svc.send(C1, {
        channel: 'SMS',
        to: '+15551230000',
        templateId: smsTemplateId,
        variables: { name: 'Sam' },
      }),
    ).rejects.toThrow(/Missing template variables/);
  });

  it('queues (does not dispatch) when the channel has no provider configured — gated', async () => {
    const msg = await svc.send(C1, {
      channel: 'WHATSAPP',
      to: '+15551230000',
      body: 'hello there',
    });
    expect(msg.status).toBe('QUEUED');
    expect(msg.error).toMatch(/no messaging provider/i);
  });
});

describe('MessagingService opt-out (compliance — self-audit C)', () => {
  it('records an inbound STOP as an opt-out and then refuses to send', async () => {
    const { intent } = await svc.recordInbound(C1, {
      channel: 'SMS',
      from: '+15559998888',
      body: 'STOP',
    });
    expect(intent).toBe('opt_out');
    expect(await svc.isOptedOut(C1, 'SMS', '+15559998888')).toBe(true);
    await expect(
      svc.send(C1, { channel: 'SMS', to: '+15559998888', body: 'promo' }),
    ).rejects.toThrow(/opted out/);
  });

  it('re-subscribes on START', async () => {
    await svc.recordInbound(C1, { channel: 'SMS', from: '+15559998888', body: 'START' });
    expect(await svc.isOptedOut(C1, 'SMS', '+15559998888')).toBe(false);
  });
});

describe('MessagingService.updateStatus', () => {
  it('updates a message delivery status by provider id', async () => {
    const msg = await svc.send(C1, { channel: 'SMS', to: '+15551112222', body: 'ping' });
    // fakeSms assigned providerMessageId SM_n; find it and mark delivered.
    const pid = `SM_${sent.length}`;
    await svc.updateStatus(C1, pid, 'DELIVERED');
    const list = await svc.listMessages(C1, 200);
    expect(list.find((m) => m.id === msg.id)?.status).toBe('DELIVERED');
  });

  it('a child never sees the parent’s messages (self-audit B)', async () => {
    await svc.send(R1, { channel: 'SMS', to: '+15550001111', body: 'parent only' });
    const c1Messages = await svc.listMessages(C1, 200);
    expect(c1Messages.some((m) => m.body === 'parent only')).toBe(false);
  });
});

describe('MessagingService idempotent webhooks (GME-02b)', () => {
  it('never regresses a delivered status to a late/replayed SENT', async () => {
    const msg = await svc.send(C1, { channel: 'SMS', to: '+15553334444', body: 'track' });
    const pid = `SM_${sent.length}`;
    await svc.updateStatus(C1, pid, 'DELIVERED');
    await svc.updateStatus(C1, pid, 'SENT'); // out-of-order/replayed → must be a no-op
    const list = await svc.listMessages(C1, 200);
    expect(list.find((m) => m.id === msg.id)?.status).toBe('DELIVERED');
  });

  it('dedupes a replayed inbound message (same provider id → recorded once)', async () => {
    await svc.recordInbound(C1, {
      channel: 'SMS',
      from: '+15556667777',
      body: 'inbound-dedupe',
      providerMessageId: 'IN_1',
    });
    await svc.recordInbound(C1, {
      channel: 'SMS',
      from: '+15556667777',
      body: 'inbound-dedupe',
      providerMessageId: 'IN_1',
    });
    const inbound = (await svc.listMessages(C1, 200)).filter((m) => m.body === 'inbound-dedupe');
    expect(inbound).toHaveLength(1);
  });
});

describe('MessagingService cost metering (GME-04)', () => {
  it('emits a messaging UsageRecord on a successful send (mirrors voice)', async () => {
    const msg = await svc.send(C1, { channel: 'SMS', to: '+15551119999', body: 'metered hello' });
    expect(msg.status).toBe('SENT');
    const rec = await db.admin.usageRecord.findFirst({
      where: { tenantId: C1, capability: 'messaging', provider: 'TWILIO' },
      orderBy: { ts: 'desc' },
    });
    expect(rec).not.toBeNull();
    expect(rec?.byok).toBe(false); // fake resolver returns managed mode
    expect(rec?.costUsd).toBeGreaterThan(0);
    expect(rec?.units).toBeGreaterThanOrEqual(1); // ≥1 SMS segment
  });

  it('does not meter a gated (QUEUED) send', async () => {
    const before = await db.admin.usageRecord.count({
      where: { tenantId: C1, capability: 'messaging' },
    });
    await svc.send(C1, { channel: 'WHATSAPP', to: '+15551119999', body: 'not sent' }); // gated → QUEUED
    const after = await db.admin.usageRecord.count({
      where: { tenantId: C1, capability: 'messaging' },
    });
    expect(after).toBe(before);
  });
});

describe('MessagingService provider fallback (GME-03)', () => {
  it('falls over to the next provider in the chain on a hard failure', async () => {
    const failing: MessageSender = {
      id: 'prov-fail',
      channel: 'SMS',
      send: async (): Promise<SendResult> => ({ status: 'FAILED', error: 'boom' }),
    };
    const good: MessageSender = {
      id: 'prov-ok',
      channel: 'SMS',
      send: async (): Promise<SendResult> => ({ status: 'SENT', providerMessageId: 'OK_1' }),
    };
    const router: MessageRouter = { selectChain: () => ['prov-fail', 'prov-ok'], record: () => {} };
    const resolver: MessagingCredsResolver = {
      resolve: async (_t, providerId) => ({ providerId, creds: {}, mode: 'managed' }),
    };
    const factory: ProviderFactory = (pid) => (pid === 'prov-fail' ? failing : good);
    const svc2 = new MessagingService(db, resolver, { router, providerFactory: factory });

    const msg = await svc2.send(C1, { channel: 'SMS', to: '+15558889999', body: 'failover' });
    expect(msg.status).toBe('SENT'); // second provider succeeded after the first failed
  });
});

describe('MessagingService India DLT enforcement (GME-06)', () => {
  const dltOk: DltResolver = {
    resolveForBody: async () => ({ dltTemplateId: 'T', senderId: 'S', entityId: 'E' }),
  };
  const dltNone: DltResolver = { resolveForBody: async () => null };

  it('blocks a +91 SMS with no matching DLT template', async () => {
    const s = new MessagingService(db, fakeResolver, {
      providerFactory: fakeFactory,
      dlt: dltNone,
    });
    await expect(s.send(C1, { channel: 'SMS', to: '+919812345678', body: 'x' })).rejects.toThrow(
      /DLT/i,
    );
  });

  it('allows a +91 SMS that matches a registered DLT template', async () => {
    const s = new MessagingService(db, fakeResolver, { providerFactory: fakeFactory, dlt: dltOk });
    // fakeResolver only resolves creds for 'twilio' (global) — the chain falls to it and sends.
    const msg = await s.send(C1, { channel: 'SMS', to: '+919812345678', body: 'ok' });
    expect(msg.status).toBe('SENT');
  });

  it('does not require DLT for a non-India SMS', async () => {
    const s = new MessagingService(db, fakeResolver, {
      providerFactory: fakeFactory,
      dlt: dltNone,
    });
    const msg = await s.send(C1, { channel: 'SMS', to: '+14155550100', body: 'ok' });
    expect(msg.status).toBe('SENT');
  });
});

describe('MessagingService rate limiting (GME-02c)', () => {
  it('rejects sends beyond the per-tenant window', async () => {
    const limited = new MessagingService(db, fakeResolver, {
      providerFactory: fakeFactory,
      rateLimiter: new RateLimiter(2, 60_000), // 2 per window for the test
    });
    await limited.send(C1, { channel: 'SMS', to: '+15551234000', body: 'one' });
    await limited.send(C1, { channel: 'SMS', to: '+15551234000', body: 'two' });
    await expect(
      limited.send(C1, { channel: 'SMS', to: '+15551234000', body: 'three' }),
    ).rejects.toThrow(/rate limit/i);
  });
});

describe('Day 93 channels — per-channel opt-out + gated dispatch', () => {
  it('opt-out is per channel: opting out of TELEGRAM does not block SMS', async () => {
    const to = 'tg-9001';
    await svc.recordInbound(C1, { channel: 'TELEGRAM', from: to, body: 'STOP' });
    expect(await svc.isOptedOut(C1, 'TELEGRAM', to)).toBe(true);
    expect(await svc.isOptedOut(C1, 'SMS', to)).toBe(false);
    // A TELEGRAM send to the opted-out contact is refused.
    await expect(svc.send(C1, { channel: 'TELEGRAM', to, body: 'hi' })).rejects.toThrow();
  });

  it('records a QUEUED message when the channel has no configured sender (gated)', async () => {
    const msg = await svc.send(C1, { channel: 'INSTAGRAM', to: 'ig-777', body: 'hello there' });
    expect(msg.channel).toBe('INSTAGRAM');
    expect(msg.status).toBe('QUEUED');
    expect(msg.error).toContain('No messaging provider');
  });
});
