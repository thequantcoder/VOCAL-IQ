import { NotFoundError, ValidationError, callbackRequestSchema } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Caller-requested callbacks (Day 80). A caller (or a no-answer) asks to be called back at a chosen
 * time; the callback scheduler worker auto-dials it then, within legal calling hours (evaluated in the
 * caller's timezone — self-audit A/C). Every read/write is RLS-scoped via `withTenant`, so a tenant
 * only ever sees its own callbacks (self-audit B). This service just manages the records; the pure
 * scheduling/timezone decisions live in `@vocaliq/shared` (`isCallbackDue`).
 */

const CALLBACK_SELECT = {
  id: true,
  agentId: true,
  contactId: true,
  callId: true,
  phone: true,
  requestedAt: true,
  timezone: true,
  note: true,
  status: true,
  attempts: true,
  nextAttemptAt: true,
  createdAt: true,
} as const;

export class CallbacksService {
  constructor(private readonly db: PrismaService) {}

  async list(tenantId: string, status?: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.callback.findMany({
        where: status ? { status } : {},
        orderBy: { requestedAt: 'asc' },
        take: 500,
        select: CALLBACK_SELECT,
      }),
    );
  }

  async get(tenantId: string, id: string) {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.callback.findFirst({ where: { id }, select: CALLBACK_SELECT }),
    );
    if (!row) throw new NotFoundError('Callback not found');
    return row;
  }

  /**
   * Schedule a callback. Used both by the management API and by the in-call flow / inbound IVR path
   * ("call me back at …"). Validates the request; the requested time is a UTC instant + the caller's
   * timezone (the caller resolves local→UTC). A far-past requested time simply becomes due immediately
   * (once inside calling hours).
   */
  async create(tenantId: string, input: unknown) {
    const parsed = callbackRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid callback');
    const d = parsed.data;
    return this.db.withTenant(tenantId, (tx) =>
      tx.callback.create({
        data: {
          tenantId,
          phone: d.phone,
          requestedAt: d.requestedAt,
          timezone: d.timezone,
          status: 'scheduled',
          ...(d.note ? { note: d.note } : {}),
          ...(d.contactId ? { contactId: d.contactId } : {}),
          ...(d.agentId ? { agentId: d.agentId } : {}),
          ...(d.callId ? { callId: d.callId } : {}),
        },
        select: CALLBACK_SELECT,
      }),
    );
  }

  /** Cancel a scheduled callback (a caller changed their mind / a dupe). Only a scheduled one cancels. */
  async cancel(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const res = await tx.callback.updateMany({
        where: { id, status: 'scheduled' },
        data: { status: 'cancelled' },
      });
      if (res.count === 0) {
        const exists = await tx.callback.findFirst({ where: { id }, select: { status: true } });
        if (!exists) throw new NotFoundError('Callback not found');
        throw new ValidationError(`Cannot cancel a callback that is ${exists.status}.`);
      }
      const row = await tx.callback.findFirst({ where: { id }, select: CALLBACK_SELECT });
      if (!row) throw new NotFoundError('Callback not found');
      return row;
    });
  }
}
