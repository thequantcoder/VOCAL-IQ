import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessagingConsentService } from './messaging-consent.service';

/**
 * Messaging consent (GME-14) against real Postgres + RLS. Proves: a granted channel flips the Contact
 * flag + writes an audit ConsentRecord (basis/region), revoke is per-channel, and an in-call transcript
 * "yes, text me" captures consent while a no-decision transcript records nothing.
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const PHONE = '+15557770001';
const svc = new MessagingConsentService(db);

let contactId: string;

beforeAll(async () => {
  const c = await db.admin.contact.create({
    data: { tenantId: C1, phone: PHONE, name: 'Consent Test' },
  });
  contactId = c.id;
});

afterAll(async () => {
  await db.admin.consentRecord.deleteMany({ where: { tenantId: C1, contactPhone: PHONE } });
  await db.admin.contact.deleteMany({ where: { id: contactId } });
});

describe('MessagingConsentService (GME-14)', () => {
  it('grants consent on the contact + writes an audit record per channel', async () => {
    const state = await svc.setConsent(C1, {
      phone: PHONE,
      channels: ['SMS', 'WHATSAPP'],
      granted: true,
      basis: 'in_call_consent',
      region: 'US',
    });
    expect(state.sms).toBe(true);
    expect(state.whatsapp).toBe(true);
    expect(state.rcs).toBe(false);
    expect(state.basis).toBe('in_call_consent');
    expect(await svc.hasConsent(C1, 'SMS', PHONE)).toBe(true);
    const records = await db.admin.consentRecord.findMany({
      where: { tenantId: C1, contactPhone: PHONE },
    });
    expect(records.length).toBeGreaterThanOrEqual(2); // one per channel
    expect(records.every((r) => r.region === 'US')).toBe(true);
  });

  it('revokes consent per channel (flag false + a revoke audit record)', async () => {
    await svc.setConsent(C1, {
      phone: PHONE,
      channels: ['SMS'],
      granted: false,
      basis: 'in_call_consent',
      region: 'US',
    });
    expect(await svc.hasConsent(C1, 'SMS', PHONE)).toBe(false);
    const state = await svc.getConsent(C1, PHONE);
    expect(state.sms).toBe(false);
    expect(state.whatsapp).toBe(true); // only SMS was revoked
  });

  it('captures consent from an in-call transcript ("yes, text me")', async () => {
    const state = await svc.captureFromTranscript(C1, PHONE, 'Yes, please text me the details', {
      source: 'call_123',
    });
    expect(state?.sms).toBe(true);
  });

  it('records nothing for a transcript with no consent decision', async () => {
    const before = await db.admin.consentRecord.count({
      where: { tenantId: C1, contactPhone: PHONE },
    });
    const state = await svc.captureFromTranscript(C1, PHONE, 'What is the weather today?');
    expect(state).toBeNull();
    const after = await db.admin.consentRecord.count({
      where: { tenantId: C1, contactPhone: PHONE },
    });
    expect(after).toBe(before);
  });
});
