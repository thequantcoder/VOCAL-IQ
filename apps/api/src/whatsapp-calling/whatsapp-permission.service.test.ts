import type { WhatsAppCallingTelephony } from '@vocaliq/provider-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { WhatsAppPermissionService } from './whatsapp-permission.service';

/**
 * WhatsApp outbound permission engine (WAC-08) against real Postgres + RLS. Dedicated tenants so the
 * grant lifecycle, send caps, expiry clock, unanswered back-off, and pre-dial gate are all provable.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff28a001';
const T2 = '00000000-0000-0000-0000-0000ff28a002';
const DNC_CONTACT = '00000000-0000-0000-0000-0000ff28c001';
const USER = '15551230001';

let sent = 0;
const fakeAdapter = {
  sendCallPermissionRequest: async () => {
    sent += 1;
  },
} as unknown as WhatsAppCallingTelephony;
const adapterFor = async () => fakeAdapter;
const at = (iso: string) => () => new Date(iso);

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `wac8-${id.slice(-4)}`,
        slug: `wac8-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
  await db.admin.contact.upsert({
    where: { id: DNC_CONTACT },
    create: { id: DNC_CONTACT, tenantId: T, phone: '15559990000', dnc: true },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('WhatsAppPermissionService — grant lifecycle', () => {
  it('defaults to no_permission for an unknown user', async () => {
    const svc = new WhatsAppPermissionService(db, adapterFor);
    const p = await svc.getPermission(T, USER);
    expect(p.status).toBe('no_permission');
  });

  it('records a temporary grant and lazily expires it (no webhook)', async () => {
    const now = new Date('2026-07-17T12:00:00Z');
    const svc = new WhatsAppPermissionService(db, adapterFor, () => now);
    await svc.recordPermissionReply(T, USER, {
      response: 'accept',
      isPermanent: false,
      expirationTimestamp: Math.floor(now.getTime() / 1000) + 3600, // +1h
    });
    expect((await svc.getPermission(T, USER)).status).toBe('temporary');

    // Two hours later the temporary grant has lapsed → flips to no_permission on read.
    const later = new WhatsAppPermissionService(db, adapterFor, at('2026-07-17T14:00:01Z'));
    expect((await later.getPermission(T, USER)).status).toBe('no_permission');
  });

  it('records a permanent grant and a rejection', async () => {
    const svc = new WhatsAppPermissionService(db, adapterFor);
    await svc.recordPermissionReply(T, USER, { response: 'accept', isPermanent: true });
    expect((await svc.getPermission(T, USER)).status).toBe('permanent');
    await svc.recordPermissionReply(T, USER, { response: 'reject' });
    expect((await svc.getPermission(T, USER)).status).toBe('no_permission');
  });
});

describe('WhatsAppPermissionService — send caps', () => {
  it('allows the first request then blocks the second within 24h', async () => {
    sent = 0;
    const user = '15551230777';
    const svc = new WhatsAppPermissionService(db, adapterFor);
    await svc.requestPermission(T, { waId: user, text: 'May we call you?' });
    expect(sent).toBe(1);
    await expect(svc.requestPermission(T, { waId: user })).rejects.toThrow(/24 hours/);
    expect(sent).toBe(1); // never sent the blocked one
  });
});

describe('WhatsAppPermissionService — canCall gate', () => {
  it('blocks no_permission, allows a permanent grant, and blocks a blocked country', async () => {
    const user = '15551239999';
    const svc = new WhatsAppPermissionService(db, adapterFor);
    expect((await svc.canCall(T, { waId: user })).reason).toBe('no_permission');

    await svc.recordPermissionReply(T, user, { response: 'accept', isPermanent: true });
    expect((await svc.canCall(T, { waId: user })).allowed).toBe(true);

    // A US business number is blocked from outbound calling.
    expect((await svc.canCall(T, { waId: user, businessE164: '+14155550100' })).reason).toBe(
      'blocked_country',
    );
  });

  it('blocks a DNC contact', async () => {
    const svc = new WhatsAppPermissionService(db, adapterFor);
    await svc.recordPermissionReply(T, '15559990000', { response: 'accept', isPermanent: true });
    const r = await svc.canCall(T, { waId: '15559990000', contactId: DNC_CONTACT });
    expect(r.reason).toBe('dnc');
  });

  it('mirrors Meta’s auto-revoke after 4 consecutive unanswered calls', async () => {
    const user = '15551235555';
    const svc = new WhatsAppPermissionService(db, adapterFor);
    await svc.recordPermissionReply(T, user, { response: 'accept', isPermanent: true });
    for (let i = 0; i < 3; i++) await svc.recordCallOutcome(T, user, false);
    // 3 unanswered → still granted but the gate hard-stops (back-off).
    expect((await svc.canCall(T, { waId: user })).reason).toBe('unanswered_backoff');
    await svc.recordCallOutcome(T, user, false); // the 4th → auto-revoke
    expect((await svc.getPermission(T, user)).status).toBe('no_permission');
    // An answer resets the counter.
    await svc.recordPermissionReply(T, user, { response: 'accept', isPermanent: true });
    await svc.recordCallOutcome(T, user, true);
    expect((await svc.getPermission(T, user)).consecutiveUnanswered).toBe(0);
  });

  it('is tenant-isolated (T2 never sees T’s grant)', async () => {
    const user = '15551230001';
    const svc = new WhatsAppPermissionService(db, adapterFor);
    await svc.recordPermissionReply(T, user, { response: 'accept', isPermanent: true });
    expect((await svc.getPermission(T2, user)).status).toBe('no_permission');
  });
});
