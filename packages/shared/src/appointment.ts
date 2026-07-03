import { z } from 'zod';
import { AppointmentStatus } from './enums.js';

/**
 * Appointments core (Day 36): slot validation, conflict detection, and the status machine —
 * pure so the booking guarantees (self-audit A = no double-booking) are unit-tested. The
 * API enforces conflicts on book/reschedule; the Google Calendar 2-way sync is a separate,
 * injected port (gated until OAuth creds are set).
 */

export const appointmentSlotSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((s) => s.endsAt.getTime() > s.startsAt.getTime(), {
    message: 'endsAt must be after startsAt',
  });
export type AppointmentSlot = z.infer<typeof appointmentSlotSchema>;

/** A booked interval to check against (non-cancelled appointments). */
export interface BookedInterval {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
}

/** Half-open interval overlap: [aStart, aEnd) intersects [bStart, bEnd). Adjacent = no overlap. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Statuses that hold a slot (a cancelled appointment frees its time). */
const ACTIVE_STATUSES = new Set<string>([
  AppointmentStatus.BOOKED,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.COMPLETED,
]);

/**
 * The existing appointments that conflict with `slot` — active (non-cancelled) intervals
 * that overlap it. `ignoreId` excludes the appointment being rescheduled (so it doesn't
 * conflict with itself). Empty result = the slot is free.
 */
export function findConflicts(
  slot: { startsAt: Date; endsAt: Date },
  existing: BookedInterval[],
  ignoreId?: string,
): BookedInterval[] {
  return existing.filter(
    (a) =>
      a.id !== ignoreId &&
      ACTIVE_STATUSES.has(a.status) &&
      overlaps(slot.startsAt, slot.endsAt, a.startsAt, a.endsAt),
  );
}

// ── Status machine ──────────────────────────────────────────────────────────────

const TRANSITIONS: Record<string, string[]> = {
  [AppointmentStatus.BOOKED]: [
    AppointmentStatus.RESCHEDULED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
  ],
  [AppointmentStatus.RESCHEDULED]: [
    AppointmentStatus.RESCHEDULED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
  ],
  [AppointmentStatus.CANCELLED]: [AppointmentStatus.BOOKED], // reopen
  [AppointmentStatus.COMPLETED]: [],
};

export function canTransitionAppointment(from: string, to: string): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * A spoken confirmation read-back for a booked slot — the agent repeats the time so the
 * caller can correct it before it's committed (blueprint §4.6).
 */
export function buildBookingConfirmation(startsAt: Date, timeZone = 'UTC'): string {
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(startsAt);
  return `I have you down for ${when}. Is that correct?`;
}
