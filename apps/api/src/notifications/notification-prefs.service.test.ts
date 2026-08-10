import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { NotificationPrefsService } from './notification-prefs.service';

/**
 * Notification preferences (FOLLOWUP) against real Postgres + RLS. Uses a DEDICATED tenant so the
 * read-modify-write on the shared `settings` JSON can't race the Slack/disclosure suites.
 */
const db = new PrismaService();
const svc = new NotificationPrefsService(db);
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff10a001';

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'NotifPrefs',
      slug: `notifprefs-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('NotificationPrefsService', () => {
  it('defaults to empty prefs (every channel enabled by default)', async () => {
    expect(await svc.getPrefs(T)).toEqual({});
  });

  it('round-trips an override', async () => {
    const saved = await svc.setPrefs(T, { 'call.completed:slack': false });
    expect(saved['call.completed:slack']).toBe(false);
    expect(await svc.getPrefs(T)).toEqual({ 'call.completed:slack': false });
  });

  it('rejects a non-boolean preference value', async () => {
    await expect(svc.setPrefs(T, { 'x:y': 'nope' })).rejects.toSatisfy(isAppError);
  });

  it('never clobbers other settings keys (e.g. the Slack config)', async () => {
    await db.admin.tenant.update({
      where: { id: T },
      data: { settings: { slack: { webhookUrl: 'https://hooks.slack.com/x' } } },
    });
    await svc.setPrefs(T, { 'lead.created:webhook': false });
    const t = await db.admin.tenant.findUnique({ where: { id: T }, select: { settings: true } });
    const s = t?.settings as {
      slack?: { webhookUrl?: string };
      notificationPrefs?: Record<string, boolean>;
    };
    expect(s.slack?.webhookUrl).toBe('https://hooks.slack.com/x'); // preserved
    expect(s.notificationPrefs?.['lead.created:webhook']).toBe(false);
  });
});
