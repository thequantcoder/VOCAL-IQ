import { describe, expect, it } from 'vitest';
import {
  type BookedInterval,
  appointmentSlotSchema,
  buildBookingConfirmation,
  canTransitionAppointment,
  findConflicts,
  overlaps,
} from './appointment.js';

const d = (iso: string) => new Date(iso);

describe('overlaps (half-open intervals)', () => {
  it('detects intersecting intervals; adjacent do not overlap', () => {
    expect(
      overlaps(
        d('2026-07-10T10:00Z'),
        d('2026-07-10T11:00Z'),
        d('2026-07-10T10:30Z'),
        d('2026-07-10T11:30Z'),
      ),
    ).toBe(true); // partial
    expect(
      overlaps(
        d('2026-07-10T10:00Z'),
        d('2026-07-10T11:00Z'),
        d('2026-07-10T10:15Z'),
        d('2026-07-10T10:45Z'),
      ),
    ).toBe(true); // contained
    expect(
      overlaps(
        d('2026-07-10T10:00Z'),
        d('2026-07-10T11:00Z'),
        d('2026-07-10T11:00Z'),
        d('2026-07-10T12:00Z'),
      ),
    ).toBe(false); // adjacent
    expect(
      overlaps(
        d('2026-07-10T10:00Z'),
        d('2026-07-10T11:00Z'),
        d('2026-07-10T12:00Z'),
        d('2026-07-10T13:00Z'),
      ),
    ).toBe(false); // disjoint
  });
});

describe('findConflicts', () => {
  const existing: BookedInterval[] = [
    { id: 'a', startsAt: d('2026-07-10T09:00Z'), endsAt: d('2026-07-10T10:00Z'), status: 'BOOKED' },
    {
      id: 'b',
      startsAt: d('2026-07-10T10:00Z'),
      endsAt: d('2026-07-10T11:00Z'),
      status: 'CANCELLED',
    },
    { id: 'c', startsAt: d('2026-07-10T10:30Z'), endsAt: d('2026-07-10T11:30Z'), status: 'BOOKED' },
  ];

  it('returns overlapping ACTIVE appointments only (cancelled frees its slot)', () => {
    const conflicts = findConflicts(
      { startsAt: d('2026-07-10T10:15Z'), endsAt: d('2026-07-10T10:45Z') },
      existing,
    );
    expect(conflicts.map((c) => c.id)).toEqual(['c']); // 'b' is cancelled → ignored
  });

  it('is empty for a free slot', () => {
    expect(
      findConflicts({ startsAt: d('2026-07-10T12:00Z'), endsAt: d('2026-07-10T13:00Z') }, existing),
    ).toEqual([]);
  });

  it('ignores the appointment being rescheduled (no self-conflict)', () => {
    expect(
      findConflicts(
        { startsAt: d('2026-07-10T09:00Z'), endsAt: d('2026-07-10T10:00Z') },
        existing,
        'a',
      ),
    ).toEqual([]);
  });
});

describe('canTransitionAppointment', () => {
  it('allows valid moves and blocks invalid ones', () => {
    expect(canTransitionAppointment('BOOKED', 'COMPLETED')).toBe(true);
    expect(canTransitionAppointment('BOOKED', 'CANCELLED')).toBe(true);
    expect(canTransitionAppointment('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransitionAppointment('CANCELLED', 'BOOKED')).toBe(true); // reopen
    expect(canTransitionAppointment('BOOKED', 'BOOKED')).toBe(true);
  });
});

describe('appointmentSlotSchema', () => {
  it('requires end after start', () => {
    expect(
      appointmentSlotSchema.safeParse({
        startsAt: '2026-07-10T10:00Z',
        endsAt: '2026-07-10T11:00Z',
      }).success,
    ).toBe(true);
    expect(
      appointmentSlotSchema.safeParse({
        startsAt: '2026-07-10T11:00Z',
        endsAt: '2026-07-10T10:00Z',
      }).success,
    ).toBe(false);
  });
});

describe('buildBookingConfirmation', () => {
  it('reads back the slot for confirmation', () => {
    const msg = buildBookingConfirmation(d('2026-07-10T15:00Z'), 'UTC');
    expect(msg).toContain('Is that correct?');
    expect(msg).toContain('Friday');
  });
});
