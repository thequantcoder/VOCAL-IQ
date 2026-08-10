import { describe, expect, it } from 'vitest';
import {
  isWithinMessengerCallHours,
  messengerCallSettingsSchema,
  parseMessengerCallSettings,
  toGraphMessengerCalling,
} from './messenger-call-settings.js';

describe('messenger-call-settings — schema', () => {
  it('defaults to disabled + call button visible + hours off', () => {
    const s = messengerCallSettingsSchema.parse({});
    expect(s.enabled).toBe(false);
    expect(s.callButtonVisibility).toBe('DEFAULT');
    expect(s.hours.enabled).toBe(false);
  });

  it('rejects more than 2 hour blocks per day', () => {
    const three = {
      hours: {
        enabled: true,
        timezone: 'UTC',
        weekly: [
          { dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1000' },
          { dayOfWeek: 'MONDAY', openTime: '1100', closeTime: '1200' },
          { dayOfWeek: 'MONDAY', openTime: '1300', closeTime: '1400' },
        ],
      },
    };
    expect(() => parseMessengerCallSettings(three)).toThrow(/2 calling-hour blocks/);
  });

  it('rejects an open time not before close', () => {
    expect(() =>
      parseMessengerCallSettings({
        hours: {
          enabled: true,
          timezone: 'UTC',
          weekly: [{ dayOfWeek: 'MONDAY', openTime: '1000', closeTime: '0900' }],
        },
      }),
    ).toThrow();
  });
});

describe('messenger-call-settings — hours gate', () => {
  const settings = parseMessengerCallSettings({
    hours: {
      enabled: true,
      timezone: 'UTC',
      weekly: [{ dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1700' }],
    },
  });

  it('open inside the window, closed outside (timezone-correct)', () => {
    // 2024-01-01 is a Monday.
    expect(isWithinMessengerCallHours(settings, new Date('2024-01-01T10:00:00Z'))).toBe(true);
    expect(isWithinMessengerCallHours(settings, new Date('2024-01-01T18:00:00Z'))).toBe(false);
    // Tuesday — no block.
    expect(isWithinMessengerCallHours(settings, new Date('2024-01-02T10:00:00Z'))).toBe(false);
  });

  it('is always open when hours are disabled (24×7)', () => {
    const off = messengerCallSettingsSchema.parse({});
    expect(isWithinMessengerCallHours(off, new Date('2024-01-02T03:00:00Z'))).toBe(true);
  });
});

describe('messenger-call-settings — Meta mapping', () => {
  it('maps enabled + call-button visibility + hours to the Meta calling block', () => {
    const s = parseMessengerCallSettings({
      enabled: true,
      callButtonVisibility: 'DISABLE_ALL',
      hours: {
        enabled: true,
        timezone: 'America/New_York',
        weekly: [{ dayOfWeek: 'FRIDAY', openTime: '0900', closeTime: '1700' }],
      },
    });
    const g = toGraphMessengerCalling(s);
    expect(g.status).toBe('ENABLED');
    expect(g.call_icon_visibility).toBe('DISABLE_ALL');
    expect((g.call_hours as { status: string }).status).toBe('ENABLED');
  });

  it('disables hours block when hours off', () => {
    const g = toGraphMessengerCalling(messengerCallSettingsSchema.parse({}));
    expect(g.status).toBe('DISABLED');
    expect((g.call_hours as { status: string }).status).toBe('DISABLED');
  });
});
