import {
  type LatencySample,
  type LatencyStat,
  type ProviderLatency,
  ValidationError,
  latencySampleSchema,
  percentile,
  sampleTotal,
  summarizeLatency,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Voice-loop latency telemetry (Day 63). The voice service posts per-turn stage timings; this
 * persists them (RLS-scoped) and summarizes p50/p95 per stage against the SLOs for the dashboard
 * and regression alerting (self-audit F). It also exposes measured per-provider p95 so the router
 * can route by latency (self-audit D). Pure math lives in @vocaliq/shared.
 */

export interface LatencySummary {
  window: string;
  count: number;
  breached: boolean;
  stats: LatencyStat[];
}

export class LatencyService {
  constructor(private readonly db: PrismaService) {}

  /** Record a turn's stage timings. Called by the voice service after each agent response. */
  async record(tenantId: string, input: unknown, callId?: string): Promise<{ totalMs: number }> {
    const parsed = latencySampleSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid sample');
    const s = parsed.data;
    const totalMs = Math.round(sampleTotal(s));
    await this.db.withTenant(tenantId, (tx) =>
      tx.callLatency.create({
        data: {
          tenantId,
          ...(callId ? { callId } : {}),
          sttMs: Math.round(s.stt),
          llmTtftMs: Math.round(s.llmTtft),
          ttsTtfaMs: Math.round(s.ttsTtfa),
          networkMs: Math.round(s.network),
          totalMs,
          provider: s.provider ?? null,
          region: s.region ?? null,
        },
      }),
    );
    return { totalMs };
  }

  /** p50/p95 per stage vs SLO over a trailing window (default 24h). */
  async summary(tenantId: string, hours = 24): Promise<LatencySummary> {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.callLatency.findMany({
        where: { ts: { gte: since } },
        select: { sttMs: true, llmTtftMs: true, ttsTtfaMs: true, networkMs: true },
        take: 5000,
        orderBy: { ts: 'desc' },
      }),
    );
    const samples: LatencySample[] = rows.map((r) => ({
      stt: r.sttMs,
      llmTtft: r.llmTtftMs,
      ttsTtfa: r.ttsTtfaMs,
      network: r.networkMs,
    }));
    const { stats, breached, count } = summarizeLatency(samples);
    return { window: `${hours}h`, count, breached, stats };
  }

  /** Measured per-provider p95 (ms) over the window — feeds latency-based routing. */
  async providerLatencies(tenantId: string, hours = 24): Promise<ProviderLatency[]> {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.callLatency.findMany({
        where: { ts: { gte: since }, provider: { not: null } },
        select: { provider: true, totalMs: true },
        take: 5000,
      }),
    );
    const byProvider = new Map<string, number[]>();
    for (const r of rows) {
      if (!r.provider) continue;
      const arr = byProvider.get(r.provider) ?? [];
      arr.push(r.totalMs);
      byProvider.set(r.provider, arr);
    }
    return [...byProvider].map(([provider, vals]) => ({ provider, p95: percentile(vals, 95) }));
  }
}
