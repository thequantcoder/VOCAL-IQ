import { describe, expect, it } from 'vitest';
import {
  type CallWindow,
  type RetryPolicy,
  importContacts,
  isWithinWindow,
  nextRetry,
  normalizePhone,
  selectDueContacts,
} from './campaign.js';

describe('normalizePhone', () => {
  it('normalises to E.164 and rejects the ambiguous', () => {
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('0044 20 7946 0958')).toBe('+442079460958'); // 00 → +
    expect(normalizePhone('14155550100')).toBe('+14155550100'); // bare intl
    expect(normalizePhone('555-0100')).toBeNull(); // too short / no country
    expect(normalizePhone('')).toBeNull();
  });
});

describe('importContacts (dedupe + DNC)', () => {
  const csv = [
    'phone,name,email,company',
    '+14155550100,Ada,ada@x.com,Acme',
    '+1 415 555 0100,Ada Dup,,Acme', // same phone → duplicate
    '+14155550101,Grace,grace@x.com,IBM',
    'not-a-number,Bad,,Nope', // invalid phone
    '+14155550102,Blocked,,DNC', // on DNC list
  ].join('\n');

  it('maps, dedupes, suppresses DNC, and counts every drop', () => {
    const dnc = new Set(['+14155550102']);
    const res = importContacts(csv, { phone: 'phone', name: 'name', email: 'email' }, dnc);
    expect(res.contacts).toHaveLength(2);
    expect(res.duplicates).toBe(1);
    expect(res.invalid).toBe(1);
    expect(res.suppressed).toBe(1);
    expect(res.contacts[0]?.name).toBe('Ada');
    expect(res.contacts[0]?.fields.company).toBe('Acme'); // extra columns kept as fields
  });
});

describe('isWithinWindow (timezone-aware)', () => {
  const window: CallWindow = {
    timezone: 'America/New_York',
    days: [1, 2, 3, 4, 5], // Mon–Fri
    startMinute: 9 * 60,
    endMinute: 17 * 60,
  };
  it('respects local time-of-day and weekday', () => {
    // 2026-07-01 is a Wednesday. 14:00 UTC = 10:00 EDT → inside.
    expect(isWithinWindow(new Date('2026-07-01T14:00:00Z'), window)).toBe(true);
    // 02:00 UTC Wed = 22:00 EDT Tue → outside hours.
    expect(isWithinWindow(new Date('2026-07-01T02:00:00Z'), window)).toBe(false);
    // 2026-07-04 is a Saturday → excluded day (14:00 UTC = 10:00 EDT).
    expect(isWithinWindow(new Date('2026-07-04T14:00:00Z'), window)).toBe(false);
  });
});

describe('nextRetry (state machine)', () => {
  const policy: RetryPolicy = {
    maxAttempts: 3,
    backoffMinutes: [60, 240, 1440],
    retryOn: ['NO_ANSWER', 'BUSY'],
  };
  const now = new Date('2026-07-01T12:00:00Z');
  it('retries retryable dispositions with backoff until maxAttempts', () => {
    const d1 = nextRetry(1, 'NO_ANSWER', policy, now);
    expect(d1.action).toBe('retry');
    if (d1.action === 'retry') {
      expect(d1.attempt).toBe(2);
      expect(d1.retryAt.getTime()).toBe(now.getTime() + 60 * 60_000);
    }
    // 3rd attempt reached max → done.
    expect(nextRetry(3, 'NO_ANSWER', policy, now)).toEqual({
      action: 'done',
      reason: 'max_attempts',
    });
  });
  it('stops on success or non-retryable disposition', () => {
    expect(nextRetry(1, 'COMPLETED', policy, now).action).toBe('done');
    expect(nextRetry(1, 'DECLINED', policy, now)).toEqual({
      action: 'done',
      reason: 'terminal_disposition',
    });
  });
});

describe('selectDueContacts (pacing + concurrency caps)', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  const past = new Date('2026-07-01T11:00:00Z');
  const future = new Date('2026-07-01T13:00:00Z');
  const contacts = [
    { id: 'a', nextAttemptAt: null },
    { id: 'b', nextAttemptAt: past },
    { id: 'c', nextAttemptAt: future }, // not due yet
    { id: 'd', nextAttemptAt: null },
  ];

  it('never exceeds concurrency or pace, and skips not-yet-due contacts', () => {
    // Concurrency 5, 3 in flight → capacity 2; pace 10 → budget 2.
    const picked = selectDueContacts(contacts, {
      now,
      inFlight: 3,
      concurrency: 5,
      pacePerTick: 10,
    });
    expect(picked).toHaveLength(2);
    expect(picked).not.toContain('c'); // future → excluded

    // Pace is the tighter cap.
    expect(
      selectDueContacts(contacts, { now, inFlight: 0, concurrency: 10, pacePerTick: 1 }),
    ).toHaveLength(1);

    // At capacity → nothing launches.
    expect(
      selectDueContacts(contacts, { now, inFlight: 5, concurrency: 5, pacePerTick: 10 }),
    ).toEqual([]);
  });
});
