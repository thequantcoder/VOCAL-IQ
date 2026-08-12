import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessageCampaignService } from './message-campaign.service';
import { MessagingConsentService } from './messaging-consent.service';
import { type MessagingCredsResolver, MessagingService } from './messaging.service';
import type { ProviderFactory } from './provider-factory';
import type { MessageSender, SendResult } from './senders';

/**
 * Message campaigns (GME-17) against real Postgres + RLS. Proves a campaign sends only to CONSENTED
 * recipients (every send through the GME-15 guard), skipping opt-out + no-consent with reasons, and
 * de-duplicates the list. A fake SMS sender stands in for the carrier.
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const A = '+15551240001'; // consented → sends
const B = '+15551240002'; // opted out → skipped
const CX = '+15551240003'; // no consent → skipped

const fakeSms: MessageSender = {
  id: 'twilio',
  channel: 'SMS',
  send: async (): Promise<SendResult> => ({ status: 'SENT', providerMessageId: 'SM' }),
};
const fakeResolver: MessagingCredsResolver = {
  resolve: async (_t, pid) =>
    pid === 'twilio' ? { providerId: 'twilio', creds: {}, mode: 'managed' } : null,
};
const fakeFactory: ProviderFactory = () => fakeSms;
const messaging = new MessagingService(db, fakeResolver, { providerFactory: fakeFactory });
const consent = new MessagingConsentService(db);
const campaigns = new MessageCampaignService(messaging);

let contactId: string;

beforeAll(async () => {
  const c = await db.admin.contact.create({ data: { tenantId: C1, phone: A, name: 'Consented' } });
  contactId = c.id;
  await consent.setConsent(C1, {
    phone: A,
    channels: ['SMS'],
    granted: true,
    basis: 'in_call_consent',
    region: 'US',
  });
  await db.admin.messagingOptOut.create({ data: { tenantId: C1, channel: 'SMS', phone: B } });
});

afterAll(async () => {
  await db.admin.message.deleteMany({ where: { tenantId: C1, toAddr: { in: [A, B, CX] } } });
  await db.admin.usageRecord.deleteMany({ where: { tenantId: C1, capability: 'messaging' } });
  await db.admin.messagingOptOut.deleteMany({ where: { tenantId: C1, phone: { in: [A, B, CX] } } });
  await db.admin.consentRecord.deleteMany({ where: { tenantId: C1, contactPhone: A } });
  await db.admin.contact.deleteMany({ where: { id: contactId } });
});

describe('MessageCampaignService (GME-17)', () => {
  it('sends to consented recipients only, skipping opt-out + no-consent with reasons + de-duping', async () => {
    const res = await campaigns.send(C1, {
      channel: 'SMS',
      body: 'Flash sale — 20% off today!',
      recipients: [A, B, CX, A], // duplicate A is de-duped
      requireConsent: true,
      respectQuietHours: false, // don't let CI wall-clock block the consented send
    });
    expect(res.total).toBe(3); // de-duped
    expect(res.sent).toBe(1); // only A (consented)
    expect(res.failed).toBe(0);
    expect(res.skipped).toHaveLength(2);
    const reasons = Object.fromEntries(res.skipped.map((s) => [s.to, s.reason]));
    expect(reasons[B]).toMatch(/opted out/i);
    expect(reasons[CX]).toMatch(/consent/i);
  });

  it('requires a template or a body (schema)', async () => {
    await expect(campaigns.send(C1, { channel: 'SMS', recipients: [A] })).rejects.toThrow();
  });
});
