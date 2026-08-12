import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessagingConsentService } from './messaging-consent.service';
import { MessagingGuard } from './messaging-guard';

/**
 * Unified send-gate (GME-15) against real Postgres + RLS. Proves each gate independently — opt-out,
 * DNC/suppression, Contact.dnc, consent (opt-in), quiet-hours (opt-in TCPA window) — and that a clean
 * recipient passes. US numbers (+1) resolve to a −5h offset for the quiet-hours cases.
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const consent = new MessagingConsentService(db);
const guard = new MessagingGuard(db, consent);

const P = {
  clean: '+15559910000',
  optOut: '+15559910001',
  suppressed: '+15559910002',
  dnc: '+15559910003',
  noConsent: '+15559910004',
  consented: '+15559910005',
  quiet: '+15559910006',
};

afterAll(async () => {
  const where = { tenantId: C1, phone: { startsWith: '+155599' } };
  await db.admin.messagingOptOut.deleteMany({ where });
  await db.admin.suppression.deleteMany({ where });
  await db.admin.consentRecord.deleteMany({
    where: { tenantId: C1, contactPhone: { startsWith: '+155599' } },
  });
  await db.admin.contact.deleteMany({ where });
});

describe('MessagingGuard (GME-15)', () => {
  it('allows a clean recipient', async () => {
    expect(await guard.check(C1, { channel: 'SMS', phone: P.clean })).toEqual({ allowed: true });
  });

  it('blocks an opted-out recipient', async () => {
    await db.admin.messagingOptOut.create({
      data: { tenantId: C1, channel: 'SMS', phone: P.optOut },
    });
    expect(await guard.check(C1, { channel: 'SMS', phone: P.optOut })).toEqual({
      allowed: false,
      reason: 'opted_out',
    });
  });

  it('blocks a suppressed (DNC list) recipient', async () => {
    await db.admin.suppression.create({ data: { tenantId: C1, phone: P.suppressed } });
    expect((await guard.check(C1, { channel: 'SMS', phone: P.suppressed })).reason).toBe(
      'suppressed',
    );
  });

  it('blocks a Contact marked do-not-contact', async () => {
    await db.admin.contact.create({ data: { tenantId: C1, phone: P.dnc, dnc: true } });
    expect((await guard.check(C1, { channel: 'SMS', phone: P.dnc })).reason).toBe('dnc');
  });

  it('requires consent only when asked, and passes once consent is on record', async () => {
    // No consent + requireConsent → blocked.
    expect(
      (await guard.check(C1, { channel: 'SMS', phone: P.noConsent, requireConsent: true })).reason,
    ).toBe('no_consent');
    // Without requireConsent the same recipient is allowed (transactional path).
    expect((await guard.check(C1, { channel: 'SMS', phone: P.noConsent })).allowed).toBe(true);
    // Grant consent (needs a contact for the flag to persist) → allowed.
    await db.admin.contact.create({ data: { tenantId: C1, phone: P.consented } });
    await consent.setConsent(C1, {
      phone: P.consented,
      channels: ['SMS'],
      granted: true,
      basis: 'in_call_consent',
      region: 'US',
    });
    expect(
      (await guard.check(C1, { channel: 'SMS', phone: P.consented, requireConsent: true })).allowed,
    ).toBe(true);
  });

  it('enforces the TCPA quiet-hours window only when respected', async () => {
    // 03:00 UTC − 5h (US) = 22:00 local → quiet.
    expect(
      (
        await guard.check(C1, {
          channel: 'SMS',
          phone: P.quiet,
          respectQuietHours: true,
          now: new Date('2026-01-01T03:00:00Z'),
        })
      ).reason,
    ).toBe('quiet_hours');
    // 15:00 UTC − 5h = 10:00 local → allowed.
    expect(
      (
        await guard.check(C1, {
          channel: 'SMS',
          phone: P.quiet,
          respectQuietHours: true,
          now: new Date('2026-01-01T15:00:00Z'),
        })
      ).allowed,
    ).toBe(true);
    // Without respectQuietHours the same 22:00-local send is allowed (transactional).
    expect(
      (
        await guard.check(C1, {
          channel: 'SMS',
          phone: P.quiet,
          now: new Date('2026-01-01T03:00:00Z'),
        })
      ).allowed,
    ).toBe(true);
  });
});
