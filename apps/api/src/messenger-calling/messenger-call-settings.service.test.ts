import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessengerCallSettingsService } from './messenger-call-settings.service';

/**
 * MEC-05 call settings against real Postgres + RLS. The adapter resolves null (no creds) so the sync is
 * local-only (gated) — get returns defaults, set persists to the tenant `settings` JSON, re-get reads it.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff34a001';

const svc = new MessengerCallSettingsService(db, async () => null);

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'mec5',
      slug: `mec5-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('MessengerCallSettingsService (MEC-05)', () => {
  it('returns disabled defaults for a tenant with no settings', async () => {
    const s = await svc.get(T);
    expect(s.enabled).toBe(false);
    expect(s.callButtonVisibility).toBe('DEFAULT');
    expect(s.hours.enabled).toBe(false);
  });

  it('persists settings (gated: local-only when no adapter) and reads them back', async () => {
    const saved = await svc.set(T, {
      enabled: true,
      callButtonVisibility: 'DISABLE_ALL',
      hours: {
        enabled: true,
        timezone: 'America/New_York',
        weekly: [{ dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1700' }],
      },
    });
    expect(saved.enabled).toBe(true);
    expect(saved.callButtonVisibility).toBe('DISABLE_ALL');

    const reread = await svc.get(T);
    expect(reread.enabled).toBe(true);
    expect(reread.hours.timezone).toBe('America/New_York');
    expect(reread.hours.weekly).toHaveLength(1);
  });

  it('rejects invalid settings (>2 blocks/day) with a validation error', async () => {
    await expect(
      svc.set(T, {
        hours: {
          enabled: true,
          timezone: 'UTC',
          weekly: [
            { dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1000' },
            { dayOfWeek: 'MONDAY', openTime: '1100', closeTime: '1200' },
            { dayOfWeek: 'MONDAY', openTime: '1300', closeTime: '1400' },
          ],
        },
      }),
    ).rejects.toThrow(/2 calling-hour blocks/);
  });
});
