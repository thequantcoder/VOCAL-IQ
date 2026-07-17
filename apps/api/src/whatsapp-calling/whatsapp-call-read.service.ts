import { WHATSAPP_TIER0_MAX_MINUTES } from '@vocaliq/provider-router';
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
}
