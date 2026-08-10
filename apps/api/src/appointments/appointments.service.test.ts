import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { AppointmentsService } from './appointments.service';

/**
 * Appointments (Day 36), against real Postgres (RLS-scoped). Proves: book with conflict
 * rejection (no double-book), reschedule + cancel free the slot, stats, and tenant scoping.
 */

const db = new PrismaService();
const svc = new AppointmentsService(db); // no-op calendar sync
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const createdContacts: string[] = [];
const createdAppts: string[] = [];

async function contact(tenantId: string): Promise<string> {
  const c = await db.admin.contact.create({
    data: { tenantId, phone: `+1415551${Math.floor(1000 + Math.random() * 8999)}` },
    select: { id: true },
  });
  createdContacts.push(c.id);
  return c.id;
}

afterAll(async () => {
  await db.admin.appointment.deleteMany({ where: { id: { in: createdAppts } } });
  await db.admin.contact.deleteMany({ where: { id: { in: createdContacts } } });
});

const slot = (h: number) => ({
  startsAt: new Date(`2027-03-15T${String(h).padStart(2, '0')}:00:00Z`),
  endsAt: new Date(`2027-03-15T${String(h + 1).padStart(2, '0')}:00:00Z`),
});

describe('AppointmentsService', () => {
  it('books a slot, rejects an overlapping one, then frees it on cancel', async () => {
    const contactId = await contact(C1);
    const a = await svc.book(C1, { contactId, ...slot(10) });
    createdAppts.push(a.id);
    expect(a.status).toBe('BOOKED');

    // Overlapping slot → ConflictError.
    await expect(
      svc.book(C1, {
        contactId,
        startsAt: new Date('2027-03-15T10:30:00Z'),
        endsAt: new Date('2027-03-15T11:30:00Z'),
      }),
    ).rejects.toSatisfy(isAppError);

    // Cancel frees the slot → the overlapping booking now succeeds.
    await svc.setStatus(C1, a.id, 'CANCELLED');
    const b = await svc.book(C1, {
      contactId,
      startsAt: new Date('2027-03-15T10:30:00Z'),
      endsAt: new Date('2027-03-15T11:30:00Z'),
    });
    createdAppts.push(b.id);
    expect(b.status).toBe('BOOKED');
  });

  it('reschedules with a conflict check and reports stats', async () => {
    const contactId = await contact(C1);
    const a = await svc.book(C1, { contactId, ...slot(14) });
    const b = await svc.book(C1, { contactId, ...slot(16) });
    createdAppts.push(a.id, b.id);

    // Reschedule a into b's slot → conflict.
    await expect(svc.reschedule(C1, a.id, slot(16))).rejects.toSatisfy(isAppError);
    // Reschedule a to a free slot → ok.
    const moved = await svc.reschedule(C1, a.id, slot(18));
    expect(moved.status).toBe('RESCHEDULED');

    const stats = await svc.stats(C1);
    expect(stats.booked + stats.rescheduled).toBeGreaterThanOrEqual(2);

    await svc.setStatus(C1, b.id, 'COMPLETED');
    expect((await svc.stats(C1)).completed).toBeGreaterThanOrEqual(1);
  });

  it('rejects a foreign-tenant contact and isolates appointments (RLS)', async () => {
    const foreign = await contact(R1);
    await expect(svc.book(C1, { contactId: foreign, ...slot(20) })).rejects.toSatisfy(isAppError);

    const r1Appt = await svc.book(R1, { contactId: foreign, ...slot(20) });
    createdAppts.push(r1Appt.id);
    // C1 (child) cannot see R1's (parent-reseller) appointment.
    expect(await svc.list(C1)).not.toContainEqual(expect.objectContaining({ id: r1Appt.id }));
  });
});
