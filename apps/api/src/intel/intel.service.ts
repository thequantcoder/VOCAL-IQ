import {
  type DetectedSignal,
  type SignalAlertRule,
  type SignalType,
  aggregateSignals,
  evaluateSignalAlerts,
  extractSignals,
  segmentsToText,
} from '@vocaliq/shared';
import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import type { PrismaService } from '../db/prisma.service';

/**
 * Conversation intelligence (Day 75). Turns call volume into market intelligence: it mines each
 * call's transcript for objections, buying signals, competitor mentions, feature requests, and
 * churn risk (deterministically — ZERO added LLM spend, self-audit D), persists them as
 * `CallSignal` rows, and serves trend dashboards + threshold alerts. Extraction is idempotent per
 * call (re-running replaces). Everything is RLS-scoped (self-audit B).
 */

const alertRuleSchema = z.object({
  type: z.enum(['objection', 'buying_signal', 'competitor', 'feature_request', 'churn_risk']),
  label: z.string().max(80).optional(),
  threshold: z.number().int().min(1).max(10000),
});
const configSchema = z.object({
  competitors: z.array(z.string().min(1).max(80)).max(100).default([]),
  alertRules: z.array(alertRuleSchema).max(50).default([]),
});

export class IntelService {
  constructor(private readonly db: PrismaService) {}

  // ── Config (competitor watchlist + alert rules) ────────────────────────────────

  async getConfig(
    tenantId: string,
  ): Promise<{ competitors: string[]; alertRules: SignalAlertRule[] }> {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.conversationIntelConfig.findFirst({ select: { competitors: true, alertRules: true } }),
    );
    return {
      competitors: row?.competitors ?? [],
      alertRules: (row?.alertRules as SignalAlertRule[] | undefined) ?? [],
    };
  }

  async setConfig(tenantId: string, input: unknown) {
    const parsed = configSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid config');
    const { competitors, alertRules } = parsed.data;
    // Nullable-composite upsert isn't available on a find-by-unique here; find-then-write by tenantId.
    await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.conversationIntelConfig.findFirst({ select: { id: true } });
      if (existing) {
        await tx.conversationIntelConfig.update({
          where: { id: existing.id },
          data: { competitors, alertRules: alertRules as object },
        });
      } else {
        await tx.conversationIntelConfig.create({
          data: { tenantId, competitors, alertRules: alertRules as object },
        });
      }
    });
    return this.getConfig(tenantId);
  }

  // ── Extraction (idempotent per call) ────────────────────────────────────────────

  /**
   * Mine one call's transcript for signals and persist them (replacing any prior extraction for
   * that call). Deterministic — no LLM call, so this adds no per-call cost. Returns the signals.
   */
  async extractForCall(tenantId: string, callId: string): Promise<{ signals: DetectedSignal[] }> {
    const { competitors } = await this.getConfig(tenantId);
    const transcript = await this.db.withTenant(tenantId, (tx) =>
      tx.transcript.findFirst({ where: { callId }, select: { segments: true, searchText: true } }),
    );
    const text = transcript?.searchText ?? segmentsToText(transcript?.segments ?? []);
    const signals = text ? extractSignals(text, competitors) : [];

    await this.db.withTenant(tenantId, async (tx) => {
      await tx.callSignal.deleteMany({ where: { callId } });
      if (signals.length > 0) {
        await tx.callSignal.createMany({
          data: signals.map((s) => ({
            tenantId,
            callId,
            type: s.type,
            label: s.label,
            quote: s.quote ?? null,
          })),
        });
      }
    });
    return { signals };
  }

  // ── Trends + alerts ──────────────────────────────────────────────────────────────

  /** Aggregate signals over a rolling window into (type,label) counts — the trend dashboard. */
  async trends(tenantId: string, sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 86_400_000);
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.callSignal.groupBy({
        by: ['type', 'label'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    );
    const flat = rows.flatMap((r) =>
      Array.from({ length: r._count._all }, () => ({ type: r.type as SignalType, label: r.label })),
    );
    return aggregateSignals(flat);
  }

  /**
   * Evaluate the tenant's alert rules against the recent window; fire an in-app notification per
   * breach. Returns the fired alerts. (A cooldown/de-dup layer can wrap this for scheduled runs.)
   */
  async checkAlerts(tenantId: string, sinceDays = 7) {
    const { alertRules } = await this.getConfig(tenantId);
    if (alertRules.length === 0) return { fired: [] };
    const aggregate = await this.trends(tenantId, sinceDays);
    const fired = evaluateSignalAlerts(aggregate, alertRules);
    for (const f of fired) {
      await this.db.admin.notification.create({
        data: {
          tenantId,
          channel: 'inapp',
          payload: {
            type: 'conversation_intel_alert',
            signalType: f.type,
            label: f.label,
            count: f.count,
            threshold: f.threshold,
          } as object,
        },
      });
    }
    return { fired };
  }

  /** Searchable/filterable raw signals — feeds the drill-down + coaching/product loops. */
  async listSignals(
    tenantId: string,
    filter: { type?: string; label?: string; callId?: string; limit?: number } = {},
  ) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.callSignal.findMany({
        where: {
          ...(filter.type ? { type: filter.type } : {}),
          ...(filter.label ? { label: filter.label } : {}),
          ...(filter.callId ? { callId: filter.callId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(filter.limit ?? 100, 500),
        select: { id: true, callId: true, type: true, label: true, quote: true, createdAt: true },
      }),
    );
  }
}
