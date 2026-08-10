import { describe, expect, it } from 'vitest';
import {
  isWithinWhatsappCallHours,
  parseWhatsappCallSettings,
  toGraphCalling,
  whatsappCallSettingsSchema,
} from './whatsapp-call-settings.js';

const base = () => whatsappCallSettingsSchema.parse({});

describe('parseWhatsappCallSettings', () => {
  it('applies defaults', () => {
    const s = parseWhatsappCallSettings({});
    expect(s.enabled).toBe(false);
    expect(s.callIconVisibility).toBe('DEFAULT');
    expect(s.hours.timezone).toBe('UTC');
  });

  it('rejects >2 blocks on one day', () => {
    expect(() =>
      parseWhatsappCallSettings({
        hours: {
          enabled: true,
          weekly: [
            { dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1000' },
            { dayOfWeek: 'MONDAY', openTime: '1100', closeTime: '1200' },
            { dayOfWeek: 'MONDAY', openTime: '1300', closeTime: '1400' },
          ],
        },
      }),
    ).toThrow(/2 calling-hour blocks/);
  });

  it('rejects an open>=close block and enabled voicemail with no trigger', () => {
    expect(() =>
      whatsappCallSettingsSchema.parse({
        hours: { weekly: [{ dayOfWeek: 'TUESDAY', openTime: '1700', closeTime: '0900' }] },
      }),
    ).toThrow();
    expect(() => parseWhatsappCallSettings({ voicemail: { enabled: true, triggers: [] } })).toThrow(
      /at least one trigger/i,
    );
  });
});

describe('isWithinWhatsappCallHours', () => {
  it('is always open when hours are disabled', () => {
    expect(isWithinWhatsappCallHours(base(), new Date('2026-07-16T03:00:00Z'))).toBe(true);
  });

  it('honours a weekly window in the configured timezone', () => {
    const s = parseWhatsappCallSettings({
      hours: {
        enabled: true,
        timezone: 'America/New_York',
        weekly: [{ dayOfWeek: 'THURSDAY', openTime: '0900', closeTime: '1700' }],
      },
    });
    // 2026-07-16 is a Thursday. 14:00 UTC = 10:00 EDT → open; 01:00 UTC = prior 21:00 EDT Wed → closed.
    expect(isWithinWhatsappCallHours(s, new Date('2026-07-16T14:00:00Z'))).toBe(true);
    expect(isWithinWhatsappCallHours(s, new Date('2026-07-16T01:00:00Z'))).toBe(false);
  });

  it('a holiday block overrides the weekly schedule', () => {
    const s = parseWhatsappCallSettings({
      hours: {
        enabled: true,
        timezone: 'UTC',
        weekly: [{ dayOfWeek: 'THURSDAY', openTime: '0000', closeTime: '2359' }],
        holidays: [{ date: '2026-07-16', startTime: '0000', endTime: '0000' }], // closed all day
      },
    });
    expect(isWithinWhatsappCallHours(s, new Date('2026-07-16T12:00:00Z'))).toBe(false);
  });
});

describe('toGraphCalling', () => {
  it('maps our settings to Meta’s calling block', () => {
    const s = parseWhatsappCallSettings({
      enabled: true,
      callbackPermission: true,
      restrictToCountries: ['US', 'BR'],
      additionalCodecs: ['PCMU'],
      hours: {
        enabled: true,
        timezone: 'Asia/Kolkata',
        weekly: [{ dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1800' }],
      },
      voicemail: { enabled: true, triggers: ['REJECT', 'TIMEOUT'], announcementMediaId: '123' },
    });
    const g = toGraphCalling(s) as Record<string, unknown>;
    expect(g.status).toBe('ENABLED');
    expect(g.callback_permission_status).toBe('ENABLED');
    expect(g.call_icons).toEqual({ restrict_to_user_countries: ['US', 'BR'] });
    expect(g.audio).toEqual({ additional_codecs: ['PCMU'] });
    expect((g.call_hours as { timezone_id: string }).timezone_id).toBe('Asia/Kolkata');
    expect((g.voicemail as { status: string }).status).toBe('ENABLED');
  });

  it('disables hours + voicemail when off', () => {
    const g = toGraphCalling(base()) as Record<string, { status?: string }>;
    expect(g.call_hours?.status).toBe('DISABLED');
    expect(g.voicemail?.status).toBe('DISABLED');
    expect(g.status).toBe('DISABLED');
  });
});
