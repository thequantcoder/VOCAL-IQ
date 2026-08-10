import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALLING_RULES,
  type DueCallback,
  callbackNodeConfigSchema,
  callbackRequestSchema,
  isCallbackDue,
  isValidTimeZone,
  nextCallbackAttempt,
  zonedWallClockToUtc,
} from './callback.js';
import { validateNodeConfig } from './flow-node-config.js';

const cb = (over: Partial<DueCallback> = {}): DueCallback => ({
  id: 'cb1',
  requestedAt: new Date('2026-07-01T00:00:00Z'),
  nextAttemptAt: null,
  timezone: 'UTC',
  status: 'scheduled',
  ...over,
});

describe('callbackRequestSchema', () => {
  it('coerces the requested time + defaults the timezone', () => {
    const p = callbackRequestSchema.parse({
      phone: '+15551234567',
      requestedAt: '2026-07-01T15:00:00Z',
    });
    expect(p.requestedAt instanceof Date).toBe(true);
    expect(p.timezone).toBe('UTC');
  });
  it('rejects a too-short phone', () => {
    expect(callbackRequestSchema.safeParse({ phone: '1', requestedAt: new Date() }).success).toBe(
      false,
    );
  });
  it('rejects an invalid IANA timezone (self-audit A)', () => {
    expect(
      callbackRequestSchema.safeParse({
        phone: '+15551234567',
        requestedAt: '2026-07-01T15:00:00Z',
        timezone: 'Mars/Phobos',
      }).success,
    ).toBe(false);
    expect(
      callbackRequestSchema.safeParse({
        phone: '+15551234567',
        requestedAt: '2026-07-01T15:00:00Z',
        timezone: 'Asia/Tokyo',
      }).success,
    ).toBe(true);
  });
});

describe('isValidTimeZone', () => {
  it('accepts real zones, rejects junk', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('zonedWallClockToUtc (self-audit A — wall-clock in caller timezone → UTC)', () => {
  it('interprets the wall-clock in the target timezone, not the runner timezone', () => {
    // 3pm wall-clock in New_York (EDT = UTC-4 in July) → 19:00 UTC.
    expect(zonedWallClockToUtc('2026-07-01T15:00', 'America/New_York').toISOString()).toBe(
      '2026-07-01T19:00:00.000Z',
    );
    // 3pm wall-clock in Tokyo (UTC+9) → 06:00 UTC.
    expect(zonedWallClockToUtc('2026-07-01T15:00', 'Asia/Tokyo').toISOString()).toBe(
      '2026-07-01T06:00:00.000Z',
    );
    // UTC is identity.
    expect(zonedWallClockToUtc('2026-07-01T15:00', 'UTC').toISOString()).toBe(
      '2026-07-01T15:00:00.000Z',
    );
  });
  it('respects standard vs daylight offset (winter EST = UTC-5)', () => {
    expect(zonedWallClockToUtc('2026-01-15T15:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T20:00:00.000Z',
    );
  });
});

describe('isCallbackDue — scheduling (self-audit A)', () => {
  const noon = new Date('2026-07-01T12:00:00Z'); // Wed, 12:00 UTC (within 8am–9pm)

  it('not due before the requested time', () => {
    expect(isCallbackDue(cb({ requestedAt: new Date('2026-07-01T13:00:00Z') }), noon)).toBe(false);
  });
  it('due once the requested time has passed and we are in the window', () => {
    expect(isCallbackDue(cb({ requestedAt: new Date('2026-07-01T09:00:00Z') }), noon)).toBe(true);
  });
  it('a cancelled/completed callback is never due', () => {
    expect(isCallbackDue(cb({ status: 'cancelled' }), noon)).toBe(false);
    expect(isCallbackDue(cb({ status: 'completed' }), noon)).toBe(false);
  });
  it('honours the retry time over the requested time', () => {
    const c = cb({
      requestedAt: new Date('2026-07-01T09:00:00Z'),
      nextAttemptAt: new Date('2026-07-01T13:00:00Z'), // retry not reached yet
    });
    expect(isCallbackDue(c, noon)).toBe(false);
  });
});

describe('isCallbackDue — legal calling window in the caller timezone (self-audit C)', () => {
  // In July, America/New_York = UTC-4. Callback requested well in the past, so timing is only about
  // the window.
  const past = new Date('2026-06-01T00:00:00Z');

  it('held outside legal hours — 2am local is NOT due', () => {
    // 06:00 UTC = 02:00 in New_York → outside 8am–9pm.
    const now = new Date('2026-07-01T06:00:00Z');
    expect(isCallbackDue(cb({ requestedAt: past, timezone: 'America/New_York' }), now)).toBe(false);
  });
  it('dialed inside legal hours — 10am local IS due', () => {
    // 14:00 UTC = 10:00 in New_York → within 8am–9pm.
    const now = new Date('2026-07-01T14:00:00Z');
    expect(isCallbackDue(cb({ requestedAt: past, timezone: 'America/New_York' }), now)).toBe(true);
  });
  it('the same UTC instant differs by timezone', () => {
    // 03:00 UTC: New_York = 23:00 (outside) but Tokyo = 12:00 (inside, UTC+9).
    const now = new Date('2026-07-01T03:00:00Z');
    expect(isCallbackDue(cb({ requestedAt: past, timezone: 'America/New_York' }), now)).toBe(false);
    expect(isCallbackDue(cb({ requestedAt: past, timezone: 'Asia/Tokyo' }), now)).toBe(true);
  });
  it('respects tightened calling rules', () => {
    // 14:00 UTC = 10:00 New_York, but a 9am–10am-only rule excludes 10:00 (endMinute exclusive).
    const now = new Date('2026-07-01T14:00:00Z');
    const strict = { ...DEFAULT_CALLING_RULES, startMinute: 9 * 60, endMinute: 10 * 60 };
    expect(
      isCallbackDue(cb({ requestedAt: past, timezone: 'America/New_York' }), now, strict),
    ).toBe(false);
  });
});

describe('nextCallbackAttempt — retry if missed', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  it('retries before max attempts, backing off', () => {
    const d = nextCallbackAttempt(1, now, { maxAttempts: 3, retryAfterMinutes: 30 });
    expect(d).toEqual({
      action: 'retry',
      nextAttemptAt: new Date('2026-07-01T12:30:00Z'),
      attempt: 2,
    });
  });
  it('gives up at max attempts', () => {
    expect(nextCallbackAttempt(3, now, { maxAttempts: 3, retryAfterMinutes: 30 })).toEqual({
      action: 'give_up',
    });
  });
});

describe('CALLBACK flow node config', () => {
  it('accepts an empty config (all defaults) and rejects a bad lead time', () => {
    expect(validateNodeConfig('CALLBACK', {}).valid).toBe(true);
    expect(callbackNodeConfigSchema.parse({}).defaultLeadMinutes).toBe(60);
    expect(validateNodeConfig('CALLBACK', { defaultLeadMinutes: -5 }).valid).toBe(false);
  });
});
