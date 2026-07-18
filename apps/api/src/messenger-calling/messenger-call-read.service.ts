import { type MessengerCallContext, NotFoundError, fromMessengerCallRef } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Messenger Calling dashboard read model (MEC-04) — the numbers behind the panel: today's call KPIs,
 * this-month minutes, and the recent-calls feed. Messenger calling is free-tier (always `tier0`) and has
 * no volume table yet (MEC-06 adds metering), so monthly minutes are summed straight from the call
 * durations. All tenant-scoped (`withTenant` → RLS); pure reads, no side effects.
 */

export interface MessengerCallRow {
  meCallId: string;
  direction: string; // USER_INITIATED | BUSINESS_INITIATED
  status: string;
  psid: string | null;
  durationSec: number | null;
  costUsd: number | null;
  createdAt: Date;
}

export interface MessengerCallOverview {
  enabled: boolean;
  stats: {
    callsToday: number;
    answeredToday: number;
    avgDurationSec: number;
    costTodayUsd: number;
  };
  monthly: { period: string; minutes: number; tier: 'tier0' | 'tier1' };
  recent: MessengerCallRow[];
}

/** One lifecycle event on the live-call timeline (payload/SDP deliberately omitted — status only). */
export interface MessengerCallEventRow {
  event: string;
  at: Date;
}

/** The live-call view model (MEC-04): who's calling, why, current status, and the linked unified call. */
export interface MessengerLiveCall {
  meCallId: string;
  direction: string;
  status: string;
  psid: string | null;
  pageId: string | null;
  /** The tapped-button / m.me `ref` context decoded from the payload — "why they're calling". */
  context: MessengerCallContext;
  /** The unified Call this Messenger call opened (once answered) — links to the shared call detail. */
  callId: string | null;
  agent: { id: string; name: string } | null;
  durationSec: number | null;
  startedAt: Date | null;
  createdAt: Date;
  events: MessengerCallEventRow[];
}

const ANSWERED = ['accepted', 'completed'];

function startOfUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function utcPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export class MessengerCallReadService {
  constructor(private readonly db: PrismaService) {}

  async overview(tenantId: string): Promise<MessengerCallOverview> {
    const since = startOfUtcToday();
    const monthStart = startOfUtcMonth();

    return this.db.withTenant(tenantId, async (tx) => {
      const [tenant, callsToday, answeredToday, todayAgg, monthAgg, recent] = await Promise.all([
        tx.tenant.findFirst({ select: { settings: true } }),
        tx.messengerCall.count({ where: { createdAt: { gte: since } } }),
        tx.messengerCall.count({
          where: { createdAt: { gte: since }, status: { in: ANSWERED } },
        }),
        tx.messengerCall.aggregate({
          where: { createdAt: { gte: since } },
          _avg: { durationSec: true },
          _sum: { costUsd: true },
        }),
        tx.messengerCall.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { durationSec: true },
        }),
        tx.messengerCall.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            meCallId: true,
            direction: true,
            status: true,
            psid: true,
            durationSec: true,
            costUsd: true,
            createdAt: true,
          },
        }),
      ]);

      const settings = (tenant?.settings ?? {}) as { messengerCalling?: { enabled?: boolean } };
      const minutes = Math.round(((monthAgg._sum.durationSec ?? 0) / 60) * 10) / 10;

      return {
        enabled: settings.messengerCalling?.enabled === true,
        stats: {
          callsToday,
          answeredToday,
          avgDurationSec: Math.round(todayAgg._avg.durationSec ?? 0),
          costTodayUsd: todayAgg._sum.costUsd ?? 0,
        },
        // Messenger calling is free-tier → always tier0 (metering + real tiering land in MEC-06).
        monthly: { period: utcPeriod(), minutes, tier: 'tier0' },
        recent,
      };
    });
  }

  /** One Messenger call for the live-call view: identity, decoded context, status, timeline, linked call. */
  async liveCall(tenantId: string, meCallId: string): Promise<MessengerLiveCall> {
    return this.db.withTenant(tenantId, async (tx) => {
      const me = await tx.messengerCall.findUnique({
        where: { tenantId_meCallId: { tenantId, meCallId } },
        select: {
          meCallId: true,
          direction: true,
          status: true,
          psid: true,
          pageId: true,
          refPayload: true,
          callId: true,
          durationSec: true,
          startedAt: true,
          createdAt: true,
        },
      });
      if (!me) throw new NotFoundError('Messenger call not found');

      const [call, events] = await Promise.all([
        me.callId
          ? tx.call.findFirst({
              where: { id: me.callId },
              select: { agent: { select: { id: true, name: true } } },
            })
          : Promise.resolve(null),
        tx.messengerCallEvent.findMany({
          where: { meCallId },
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: { event: true, createdAt: true },
        }),
      ]);

      return {
        meCallId: me.meCallId,
        direction: me.direction,
        status: me.status,
        psid: me.psid,
        pageId: me.pageId,
        context: fromMessengerCallRef(me.refPayload ?? ''),
        callId: me.callId,
        agent: call?.agent ?? null,
        durationSec: me.durationSec,
        startedAt: me.startedAt,
        createdAt: me.createdAt,
        events: events.map((e) => ({ event: e.event, at: e.createdAt })),
      };
    });
  }
}
