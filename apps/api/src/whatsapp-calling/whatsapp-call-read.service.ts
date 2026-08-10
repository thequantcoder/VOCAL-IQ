import { WHATSAPP_TIER0_MAX_MINUTES } from '@vocaliq/provider-router';
import {
  NotFoundError,
  type WhatsAppCallContext,
  decodeWhatsAppCallPayload,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import { whatsappCallPeriod } from './whatsapp-call-cost.service';

/**
 * WhatsApp Calling dashboard read model (WAC-07) — the numbers behind the panel: today's call KPIs,
 * this-month billed minutes + pricing tier (from the WAC-06 volume accrual), and the recent-calls
 * feed. All tenant-scoped (`withTenant` → RLS); pure reads, no side effects.
 */

export interface WhatsAppCallRow {
  waCallId: string;
  direction: string; // USER_INITIATED | BUSINESS_INITIATED
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  durationSec: number | null;
  costUsd: number | null;
  billedCountry: string | null;
  createdAt: Date;
}

export interface WhatsAppCallOverview {
  enabled: boolean;
  stats: {
    callsToday: number;
    answeredToday: number;
    avgDurationSec: number;
    costTodayUsd: number;
  };
  monthly: { period: string; minutes: number; tier: 'tier0' | 'tier1' };
  recent: WhatsAppCallRow[];
}

/** One lifecycle event on the live-call timeline (payload/SDP deliberately omitted — status only). */
export interface WhatsAppCallEventRow {
  event: string;
  at: Date;
}

/** The live-call view model (WAC-04): who's calling, why, current status, and the linked unified call. */
export interface WhatsAppLiveCall {
  waCallId: string;
  direction: string;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  waUserId: string | null;
  /** The tapped-button / deep-link context decoded from the WAC-07 payload — "why they're calling". */
  context: WhatsAppCallContext;
  /** The unified Call this WhatsApp call opened (once answered) — links to the shared call detail. */
  callId: string | null;
  agent: { id: string; name: string } | null;
  durationSec: number | null;
  startedAt: Date | null;
  createdAt: Date;
  events: WhatsAppCallEventRow[];
}

const ANSWERED = ['accepted', 'completed'];

function startOfUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class WhatsAppCallReadService {
  constructor(private readonly db: PrismaService) {}

  async overview(tenantId: string): Promise<WhatsAppCallOverview> {
    const since = startOfUtcToday();
    const period = whatsappCallPeriod();

    return this.db.withTenant(tenantId, async (tx) => {
      const [tenant, callsToday, answeredToday, todayAgg, volume, recent] = await Promise.all([
        tx.tenant.findFirst({ select: { settings: true } }),
        tx.whatsAppCall.count({ where: { createdAt: { gte: since } } }),
        tx.whatsAppCall.count({ where: { createdAt: { gte: since }, status: { in: ANSWERED } } }),
        tx.whatsAppCall.aggregate({
          where: { createdAt: { gte: since } },
          _avg: { durationSec: true },
          _sum: { costUsd: true },
        }),
        tx.whatsAppCallVolume.findUnique({
          where: { tenantId_period: { tenantId, period } },
          select: { billedSeconds: true },
        }),
        tx.whatsAppCall.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            waCallId: true,
            direction: true,
            status: true,
            fromNumber: true,
            toNumber: true,
            durationSec: true,
            costUsd: true,
            billedCountry: true,
            createdAt: true,
          },
        }),
      ]);

      const settings = (tenant?.settings ?? {}) as { whatsappCalling?: { enabled?: boolean } };
      const minutes = Math.round(((volume?.billedSeconds ?? 0) / 60) * 10) / 10;

      return {
        enabled: settings.whatsappCalling?.enabled === true,
        stats: {
          callsToday,
          answeredToday,
          avgDurationSec: Math.round(todayAgg._avg.durationSec ?? 0),
          costTodayUsd: todayAgg._sum.costUsd ?? 0,
        },
        monthly: {
          period,
          minutes,
          tier: minutes > WHATSAPP_TIER0_MAX_MINUTES ? 'tier1' : 'tier0',
        },
        recent,
      };
    });
  }

  /** One WhatsApp call for the live-call view: identity, decoded context, status, timeline, linked call. */
  async liveCall(tenantId: string, waCallId: string): Promise<WhatsAppLiveCall> {
    return this.db.withTenant(tenantId, async (tx) => {
      const wa = await tx.whatsAppCall.findUnique({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        select: {
          waCallId: true,
          direction: true,
          status: true,
          fromNumber: true,
          toNumber: true,
          waUserId: true,
          ctaPayload: true,
          deeplinkPayload: true,
          callId: true,
          durationSec: true,
          startedAt: true,
          createdAt: true,
        },
      });
      if (!wa) throw new NotFoundError('WhatsApp call not found');

      const [call, events] = await Promise.all([
        wa.callId
          ? tx.call.findFirst({
              where: { id: wa.callId },
              select: { agent: { select: { id: true, name: true } } },
            })
          : Promise.resolve(null),
        tx.whatsAppCallEvent.findMany({
          where: { waCallId },
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: { event: true, createdAt: true },
        }),
      ]);

      return {
        waCallId: wa.waCallId,
        direction: wa.direction,
        status: wa.status,
        fromNumber: wa.fromNumber,
        toNumber: wa.toNumber,
        waUserId: wa.waUserId,
        context: decodeWhatsAppCallPayload(wa.ctaPayload ?? wa.deeplinkPayload ?? ''),
        callId: wa.callId,
        agent: call?.agent ?? null,
        durationSec: wa.durationSec,
        startedAt: wa.startedAt,
        createdAt: wa.createdAt,
        events: events.map((e) => ({ event: e.event, at: e.createdAt })),
      };
    });
  }
}
