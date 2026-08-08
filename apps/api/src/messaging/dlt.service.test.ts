import { Role } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { Actor } from '../vault/vault.service';
import { DltService, dltTemplateMatches } from './dlt.service';

/** GME-06: the India DLT compliance engine — pure template matching + tenant-scoped resolution. */

describe('dltTemplateMatches (pure compliance check)', () => {
  it('matches a rendered message against an approved {#var#} template', () => {
    const tpl = 'Hi {#var#}, your appointment is on {#var#}. - VocalIQ';
    expect(dltTemplateMatches(tpl, 'Hi Sam, your appointment is on Tuesday 3pm. - VocalIQ')).toBe(
      true,
    );
    expect(dltTemplateMatches(tpl, 'Buy now! Cheap loans!! - VocalIQ')).toBe(false);
  });

  it('is anchored — the fixed text must match exactly (no extra prefix/suffix)', () => {
    const tpl = 'Your OTP is {#var#}';
    expect(dltTemplateMatches(tpl, 'Your OTP is 123456')).toBe(true);
    expect(dltTemplateMatches(tpl, 'Spam. Your OTP is 123456')).toBe(false);
  });
});

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const actor: Actor = {
  userId: '00000000-0000-0000-0000-0000000000b1',
  tenantId: C1,
  role: Role.OWNER,
};
const svc = new DltService(db);

afterAll(async () => {
  await db.admin.dltTemplate.deleteMany({ where: { tenantId: C1 } });
});

describe('DltService', () => {
  it('registers a template and resolves a matching message (else null)', async () => {
    await svc.register(actor, {
      entityId: 'PE123',
      senderId: 'VOCLIQ',
      dltTemplateId: 'TPL1',
      body: 'Hi {#var#}, your OTP is {#var#}',
    });
    const hit = await svc.resolveForBody(C1, 'Hi Sam, your OTP is 9999');
    expect(hit).toEqual({ dltTemplateId: 'TPL1', senderId: 'VOCLIQ', entityId: 'PE123' });
    expect(await svc.resolveForBody(C1, 'Totally unrelated promo text')).toBeNull();
  });

  it('rejects an incomplete registration', async () => {
    await expect(
      svc.register(actor, { entityId: '', senderId: 'S', dltTemplateId: 'T', body: 'b' }),
    ).rejects.toThrow();
  });
});
