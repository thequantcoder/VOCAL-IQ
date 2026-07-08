import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessagingService, type Senders } from './messaging.service';
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
  channel: 'SMS',
  send: vi.fn(async (m): Promise<SendResult> => {
    sent.push({ to: m.to, body: m.body });
    return { status: 'SENT', providerMessageId: `SM_${sent.length}` };
  }),
};
const senders: Senders = { SMS: fakeSms }; // WHATSAPP intentionally unconfigured (gated)
const svc = new MessagingService(db, senders);

const templateIds: string[] = [];

afterAll(async () => {
  await db.admin.message.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.messagingOptOut.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.messageTemplate.deleteMany({ where: { id: { in: templateIds } } });
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
