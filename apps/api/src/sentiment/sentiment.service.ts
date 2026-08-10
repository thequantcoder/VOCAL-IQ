import {
  type EvaluableRule,
  type FiredAction,
  NotFoundError,
  type SentimentSignal,
  ValidationError,
  evaluateSentimentRules,
  sentimentRuleSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { DeskService } from '../desk/desk.service';

/**
 * Sentiment-triggered live actions (Day 73). The voice loop streams a per-turn sentiment signal;
 * `process` matches it against the tenant/agent's rules and DISPATCHES the fired actions in real
 * time — escalate to a human (via the Day-67 Agent Desk), alert a supervisor (notification), or
 * return a tone-shift/pause/tag instruction for the loop to apply. Debounce is DB-backed (the
 * `SentimentEvent` log is the cooldown source), so a rule can't storm even across scaled-out API
 * instances (self-audit F). Evaluation is pure (@vocaliq/shared); everything is RLS-scoped (B).
 */

export class SentimentService {
  constructor(
    private readonly db: PrismaService,
    private readonly desk: DeskService,
  ) {}

  // ── Rule config ────────────────────────────────────────────────────────────────

  async listRules(tenantId: string, agentId?: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.sentimentRule.findMany({
        where: { ...(agentId ? { OR: [{ agentId }, { agentId: null }] } : {}) },
        orderBy: { createdAt: 'desc' },
        select: RULE_SELECT,
      }),
    );
  }

  async createRule(tenantId: string, input: unknown, agentId?: string) {
    const parsed = sentimentRuleSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid rule');
    const d = parsed.data;
    return this.db.withTenant(tenantId, (tx) =>
      tx.sentimentRule.create({
        data: {
          tenantId,
          agentId: agentId ?? null,
          metric: d.metric,
          operator: d.operator,
          threshold: d.threshold,
          action: d.action,
          cooldownSec: d.cooldownSec,
          tag: d.tag ?? null,
          toneHint: d.toneHint ?? null,
          note: d.note ?? null,
        },
        select: RULE_SELECT,
      }),
    );
  }

  async deleteRule(tenantId: string, ruleId: string): Promise<{ removed: boolean }> {
    const res = await this.db.withTenant(tenantId, (tx) =>
      tx.sentimentRule.deleteMany({ where: { id: ruleId } }),
    );
    if (res.count === 0) throw new NotFoundError('Rule not found');
    return { removed: true };
  }

  // ── Live processing ────────────────────────────────────────────────────────────

  /**
   * Process one sentiment frame for a live call: evaluate the active rules (with a DB-backed
   * cooldown from the event log), dispatch the fired actions, log each event, and return the
   * actions for the voice loop to apply immediately. Fast: one rules read + one event read + a
   * batched write.
   */
  async process(
    tenantId: string,
    callId: string,
    agentId: string | null,
    signal: SentimentSignal,
    now = Date.now(),
  ): Promise<{ actions: FiredAction[] }> {
    const rules = await this.db.withTenant(tenantId, (tx) =>
      tx.sentimentRule.findMany({
        where: {
          active: true,
          ...(agentId ? { OR: [{ agentId }, { agentId: null }] } : { agentId: null }),
        },
        select: RULE_SELECT,
      }),
    );
    if (rules.length === 0) return { actions: [] };

    // DB-backed cooldown: the latest event ts per rule for this call (bounded window).
    const maxCooldownMs = Math.max(...rules.map((r) => r.cooldownSec)) * 1000;
    const recent = await this.db.withTenant(tenantId, (tx) =>
      tx.sentimentEvent.findMany({
        where: { callId, ts: { gte: new Date(now - maxCooldownMs) } },
        select: { ruleId: true, ts: true },
        orderBy: { ts: 'desc' },
      }),
    );
    const lastFiredAt: Record<string, number> = {};
    for (const e of recent) {
      if (lastFiredAt[e.ruleId] === undefined) lastFiredAt[e.ruleId] = e.ts.getTime();
    }

    const evaluable: EvaluableRule[] = rules.map((r) => ({
      id: r.id,
      metric: r.metric as EvaluableRule['metric'],
      operator: r.operator as 'gt' | 'lt',
      threshold: r.threshold,
      action: r.action as EvaluableRule['action'],
      cooldownSec: r.cooldownSec,
      ...(r.tag ? { tag: r.tag } : {}),
      ...(r.toneHint ? { toneHint: r.toneHint } : {}),
      ...(r.note ? { note: r.note } : {}),
    }));

    const fired = evaluateSentimentRules(signal, evaluable, lastFiredAt, now);
    if (fired.length === 0) return { actions: [] };

    // Dispatch side-effects (escalate + alert) and log every fired action (also the cooldown source).
    for (const f of fired) {
      if (f.action === 'escalate') {
        await this.desk
          .requestTransfer(
            tenantId,
            { callId, handoffType: 'warm', strategy: 'round_robin' },
            { reason: f.note ?? `Sentiment: ${f.metric} ${f.value.toFixed(2)}` },
          )
          .catch(() => undefined); // don't let a full desk queue block the live loop
      } else if (f.action === 'alert_supervisor') {
        await this.db.admin.notification.create({
          data: {
            tenantId,
            channel: 'inapp',
            payload: {
              type: 'sentiment_alert',
              callId,
              metric: f.metric,
              value: f.value,
              note: f.note ?? null,
            } as object,
          },
        });
      }
    }
    await this.db.admin.sentimentEvent.createMany({
      data: fired.map((f) => ({
        tenantId,
        callId,
        ruleId: f.ruleId,
        action: f.action,
        metric: f.metric,
        value: f.value,
      })),
    });

    return { actions: fired };
  }

  /** Recent fired events — the supervisor live-alerts feed. */
  async recentEvents(tenantId: string, callId?: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.sentimentEvent.findMany({
        where: callId ? { callId } : {},
        orderBy: { ts: 'desc' },
        take: 100,
        select: { id: true, callId: true, action: true, metric: true, value: true, ts: true },
      }),
    );
  }
}

const RULE_SELECT = {
  id: true,
  agentId: true,
  metric: true,
  operator: true,
  threshold: true,
  action: true,
  cooldownSec: true,
  tag: true,
  toneHint: true,
  note: true,
  active: true,
} as const;
