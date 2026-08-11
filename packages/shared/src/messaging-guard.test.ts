import { describe, expect, it } from 'vitest';
import {
  isQuietTime,
  messagingQuietHoursSchema,
  phoneUtcOffsetMinutes,
} from './messaging-guard.js';

/** GME-15: quiet-hours primitives — per-country offset + recipient-local-time window check. */

describe('phoneUtcOffsetMinutes', () => {
  it('maps E.164 country prefixes to a representative offset (longest-prefix first)', () => {
    expect(phoneUtcOffsetMinutes('+919812345678')).toBe(330); // India IST
    expect(phoneUtcOffsetMinutes('+14155550100')).toBe(-300); // US Eastern
    expect(phoneUtcOffsetMinutes('+447700900000')).toBe(0); // UK
    expect(phoneUtcOffsetMinutes('+9998887777')).toBe(0); // unknown → UTC
  });
});

describe('isQuietTime (TCPA 8am–9pm default)', () => {
  const qh = { startHour: 8, endHour: 21 };

  it('is allowed inside the local window', () => {
    // 14:00 UTC − 5h (US Eastern) = 09:00 local → OK
    expect(isQuietTime(new Date('2026-01-01T14:00:00Z'), -300, qh)).toBe(false);
    // 03:30 UTC + 5:30 (IST) = 09:00 local → OK
    expect(isQuietTime(new Date('2026-01-01T03:30:00Z'), 330, qh)).toBe(false);
  });

  it('is quiet outside the local window (before 8am or at/after 9pm)', () => {
    // 02:00 UTC − 5h = 21:00 local → quiet (>= endHour)
    expect(isQuietTime(new Date('2026-01-01T02:00:00Z'), -300, qh)).toBe(true);
    // 18:00 UTC + 5:30 = 23:30 local → quiet
    expect(isQuietTime(new Date('2026-01-01T18:00:00Z'), 330, qh)).toBe(true);
    // 10:00 UTC + 0 but window 8–21, local 10:00 OK; shift to 06:00 → quiet
    expect(isQuietTime(new Date('2026-01-01T06:00:00Z'), 0, qh)).toBe(true);
  });
});

describe('messagingQuietHoursSchema', () => {
  it('defaults to opt-out with the TCPA window', () => {
    const qh = messagingQuietHoursSchema.parse({});
    expect(qh).toEqual({ enabled: false, startHour: 8, endHour: 21 });
  });
});
