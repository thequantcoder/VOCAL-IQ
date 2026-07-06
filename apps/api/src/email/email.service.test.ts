import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { EmailService } from './email.service';

/**
 * Email campaigns (Day 72) against real Postgres. Proves the hard consent gate (no consent → no
 * send), capture-email-mid-call → consent, the metered Message record, and unsubscribe honoured
 * forever — all RLS-scoped (self-audit B/C). The Resend send is gated (disabled sender).
 */

const db = new PrismaService();
const svc = new EmailService(db, undefined, 'https://app.test', 'test-unsub-secret');

const C1 = '00000000-0000-0000-0000-000000000003';
const CONTACT = '00000000-0000-0000-0000-0000072a0001';

const TEMPLATE = { subject: 'Hi {{name}}', body: 'Your quote is {{amount}}.', language: 'en' };

beforeAll(async () => {
  await db.admin.contact.upsert({
    where: { id: CONTACT },
    create: { id: CONTACT, tenantId: C1, name: 'Ana', fields: { amount: '$99' } },
    update: {
      name: 'Ana',
      email: null,
      emailConsent: false,
      unsubscribedAt: null,
      fields: { amount: '$99' },
    },
  });
});

afterAll(async () => {
  await db.admin.message.deleteMany({ where: { tenantId: C1, contactId: CONTACT } });
  await db.admin.contact.deleteMany({ where: { id: CONTACT } });
});

describe('EmailService consent gate (self-audit C)', () => {
  it('REFUSES to send with no consent (never email a non-consented contact)', async () => {
    const r = await svc.send(C1, CONTACT, TEMPLATE);
    expect(r.status).toBe('skipped');
    expect(r.skippedReason).toBeTruthy();
    const messages = await db.admin.message.count({ where: { contactId: CONTACT } });
    expect(messages).toBe(0); // nothing sent/recorded
  });

  it('captures email + consent mid-call, then a send is attempted (gated sender → FAILED, recorded + metered)', async () => {
    const cap = await svc.captureConsent(C1, CONTACT, {
      email: 'Ana@Example.com',
      source: 'captured_on_call',
    });
    expect(cap.email).toBe('ana@example.com');

    const r = await svc.send(C1, CONTACT, TEMPLATE, { amount: '$150' });
    // The Resend sender is disabled (gated) → the send fails but is RECORDED (not skipped).
    expect(r.status).toBe('FAILED');
    const msg = await db.admin.message.findFirst({
      where: { contactId: CONTACT },
      select: { channel: true, body: true },
    });
    expect(msg?.channel).toBe('EMAIL');
    expect(msg?.body).toBe('Hi Ana'); // rendered subject
  });
});

describe('EmailService unsubscribe (honoured forever)', () => {
  it('unsubscribes via a signed token + then refuses to send', async () => {
    const url = svc.unsubscribeUrl(CONTACT); // .../u/<id>.<token>
    const seg = url.split('/u/')[1]!; // <id>.<token>
    const token = seg.slice(seg.indexOf('.') + 1);
    await svc.unsubscribe(CONTACT, token);

    const contact = await db.admin.contact.findUnique({
      where: { id: CONTACT },
      select: { unsubscribedAt: true, emailConsent: true },
    });
    expect(contact?.unsubscribedAt).toBeTruthy();
    expect(contact?.emailConsent).toBe(false);

    const r = await svc.send(C1, CONTACT, TEMPLATE);
    expect(r.status).toBe('skipped');
    expect(r.skippedReason).toContain('unsubscribed');
  });

  it('rejects a forged unsubscribe token', async () => {
    await expect(svc.unsubscribe(CONTACT, 'forged-token')).rejects.toThrow();
  });
});
