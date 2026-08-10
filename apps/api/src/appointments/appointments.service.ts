import type { TxClient } from '@vocaliq/db';
import {
  AppointmentStatus,
  type AppointmentStatus as AppointmentStatusT,
  type BookedInterval,
  ConflictError,
  NotFoundError,
  ValidationError,
  appointmentSlotSchema,
  canTransitionAppointment,
  findConflicts,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface AppointmentDto {
  id: string;
  contactId: string;
  contactName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatusT;
  calendarProvider: string | null;
  externalEventId: string | null;
  createdAt: Date;
}

export interface AppointmentStats {
  booked: number;
  rescheduled: number;
  completed: number;
  cancelled: number;
  upcoming: number;
}

/**
 * A calendar-sync port (Day 36). The Google Calendar 2-way sync lives behind this so the
 * appointments module works with NO external calendar (self-hosted default) and lights up
 * when OAuth creds are set. Default is a no-op (gated). Errors here never block a booking.
 */
export interface CalendarSync {
  onBooked(appt: AppointmentDto): Promise<void>;
  onRescheduled(appt: AppointmentDto): Promise<void>;
  onCancelled(appt: AppointmentDto): Promise<void>;
}
export const noopCalendarSync: CalendarSync = {
  onBooked: async () => {},
  onRescheduled: async () => {},
  onCancelled: async () => {},
};

export const bookSchema = z
  .object({
    contactId: z.string().uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    callId: z.string().uuid().optional(),
  })
  .refine((v) => v.endsAt.getTime() > v.startsAt.getTime(), {
    message: 'endsAt must be after startsAt',
  });

const APPT_SELECT = {
  id: true,
  contactId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  calendarProvider: true,
  externalEventId: true,
  createdAt: true,
  contact: { select: { name: true } },
} as const;

type ApptRow = {
  id: string;
  contactId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatusT;
  calendarProvider: string | null;
  externalEventId: string | null;
  createdAt: Date;
  contact: { name: string | null };
};

function toDto(row: ApptRow): AppointmentDto {
  return {
    id: row.id,
    contactId: row.contactId,
    contactName: row.contact.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    calendarProvider: row.calendarProvider,
    externalEventId: row.externalEventId,
    createdAt: row.createdAt,
  };
}

/**
 * Appointments (Day 36): agents book real slots with conflict checking + a status machine.
 * Every read/write is RLS-scoped via `withTenant` (self-audit B); booking + rescheduling
 * reject overlaps against the tenant's active appointments (self-audit A — no double-book).
 * Successful writes fan out to the injected `CalendarSync` (gated Google 2-way sync).
 */
export class AppointmentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly calendar: CalendarSync = noopCalendarSync,
  ) {}

  async list(tenantId: string, status?: string): Promise<AppointmentDto[]> {
    const where: Record<string, unknown> = {};
    if (status && Object.values(AppointmentStatus).includes(status as AppointmentStatusT)) {
      where.status = status;
    }
    const rows = (await this.db.withTenant(tenantId, (tx) =>
      tx.appointment.findMany({ where, select: APPT_SELECT, orderBy: { startsAt: 'asc' } }),
    )) as ApptRow[];
    return rows.map(toDto);
  }

  async stats(tenantId: string): Promise<AppointmentStats> {
    return this.db.withTenant(tenantId, async (tx) => {
      const grouped = await tx.appointment.groupBy({ by: ['status'], _count: { _all: true } });
      const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
      const upcoming = await tx.appointment.count({
        where: {
          startsAt: { gte: new Date() },
          status: { in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED] },
        },
      });
      return {
        booked: count(AppointmentStatus.BOOKED),
        rescheduled: count(AppointmentStatus.RESCHEDULED),
        completed: count(AppointmentStatus.COMPLETED),
        cancelled: count(AppointmentStatus.CANCELLED),
        upcoming,
      };
    });
  }

  /** Book a slot after a conflict check against the tenant's active appointments. */
  async book(tenantId: string, input: unknown): Promise<AppointmentDto> {
    const parsed = bookSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid booking');
    }
    const { contactId, startsAt, endsAt, callId } = parsed.data;
    const dto = await this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId },
        select: { id: true },
      });
      if (!contact) throw new ValidationError('Contact does not belong to this tenant');

      await this.assertNoConflict(tx, { startsAt, endsAt });

      const row = (await tx.appointment.create({
        data: {
          tenantId,
          contactId,
          startsAt,
          endsAt,
          status: AppointmentStatus.BOOKED,
          ...(callId ? { callId } : {}),
        },
        select: APPT_SELECT,
      })) as ApptRow;
      return toDto(row);
    });
    await this.calendar.onBooked(dto).catch(() => {}); // sync never blocks the booking
    return dto;
  }

  async reschedule(tenantId: string, id: string, input: unknown): Promise<AppointmentDto> {
    const parsed = appointmentSlotSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid slot');
    const { startsAt, endsAt } = parsed.data;
    const dto = await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.appointment.findFirst({ where: { id }, select: { status: true } });
      if (!existing) throw new NotFoundError('Appointment not found');
      if (!canTransitionAppointment(existing.status, AppointmentStatus.RESCHEDULED)) {
        throw new ValidationError(`Cannot reschedule a ${existing.status} appointment`);
      }
      await this.assertNoConflict(tx, { startsAt, endsAt }, id);
      const row = (await tx.appointment.update({
        where: { id },
        data: { startsAt, endsAt, status: AppointmentStatus.RESCHEDULED },
        select: APPT_SELECT,
      })) as ApptRow;
      return toDto(row);
    });
    await this.calendar.onRescheduled(dto).catch(() => {});
    return dto;
  }

  async setStatus(tenantId: string, id: string, next: string): Promise<AppointmentDto> {
    if (!Object.values(AppointmentStatus).includes(next as AppointmentStatusT)) {
      throw new ValidationError('Unknown status');
    }
    const dto = await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.appointment.findFirst({ where: { id }, select: { status: true } });
      if (!existing) throw new NotFoundError('Appointment not found');
      if (!canTransitionAppointment(existing.status, next)) {
        throw new ValidationError(`Cannot move from ${existing.status} to ${next}`);
      }
      const row = (await tx.appointment.update({
        where: { id },
        data: { status: next as AppointmentStatusT },
        select: APPT_SELECT,
      })) as ApptRow;
      return toDto(row);
    });
    if (next === AppointmentStatus.CANCELLED) await this.calendar.onCancelled(dto).catch(() => {});
    return dto;
  }

  /** Reject a slot that overlaps an active appointment (the no-double-book guarantee). */
  private async assertNoConflict(
    tx: TxClient,
    slot: { startsAt: Date; endsAt: Date },
    ignoreId?: string,
  ): Promise<void> {
    // Only fetch appointments in the overlapping window (indexed on tenantId,startsAt).
    const candidates = await tx.appointment.findMany({
      where: { startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } },
      select: { id: true, startsAt: true, endsAt: true, status: true },
    });
    const conflicts = findConflicts(slot, candidates as BookedInterval[], ignoreId);
    if (conflicts.length > 0) {
      throw new ConflictError('That time conflicts with an existing appointment');
    }
  }
}
