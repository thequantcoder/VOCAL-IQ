import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { WhatsAppCallSettingsService } from './whatsapp-call-settings.service';

/**
 * WhatsApp call settings (WAC-05) against real Postgres + RLS. Dedicated tenant so the read-modify-
 * write on the shared `settings` JSON can't race other suites. Gated adapter (null) → local-only.
 */
const db = new PrismaService();
const svc = new WhatsAppCallSettingsService(db, async () => null);
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff30a001';

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'wac-settings',
      slug: `wac-settings-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
});
afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('WhatsAppCallSettingsService', () => {
  it('returns defaults when nothing is configured', async () => {
    const s = await svc.get(T);
    expect(s.enabled).toBe(false);
    expect(s.hours.timezone).toBe('UTC');
  });

  it('round-trips a valid config and never clobbers other settings keys', async () => {
    await db.admin.tenant.update({
      where: { id: T },
      data: { settings: { slack: { webhookUrl: 'https://hooks.slack.com/x' } } },
    });
    const saved = await svc.set(T, {
      enabled: true,
      callbackPermission: true,
      hours: {
        enabled: true,
        timezone: 'America/New_York',
        weekly: [{ dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1700' }],
      },
    });
    expect(saved.enabled).toBe(true);
    expect(saved.callbackPermission).toBe(true);

    const got = await svc.get(T);
    expect(got.hours.weekly).toHaveLength(1);
    expect(got.hours.timezone).toBe('America/New_York');

    const t = await db.admin.tenant.findUnique({ where: { id: T }, select: { settings: true } });
    const s = t?.settings as {
      slack?: { webhookUrl?: string };
      whatsappCalling?: { enabled?: boolean };
    };
    expect(s.slack?.webhookUrl).toBe('https://hooks.slack.com/x'); // preserved
    expect(s.whatsappCalling?.enabled).toBe(true);
  });

  it('rejects an invalid config (>2 blocks/day)', async () => {
    await expect(
      svc.set(T, {
        hours: {
          enabled: true,
          weekly: [
            { dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1000' },
            { dayOfWeek: 'MONDAY', openTime: '1100', closeTime: '1200' },
            { dayOfWeek: 'MONDAY', openTime: '1300', closeTime: '1400' },
          ],
        },
      }),
    ).rejects.toSatisfy(isAppError);
  });
});
