import {
  NotFoundError,
  type QaCriterion,
  type QaCriterionScore,
  type QaRubricAggregate,
  type QaRubricInput,
  aggregateQaScores,
  buildQaPrompt,
  parseQaResult,
  scoreQa,
  segmentsToText,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * QA scoring API (Day 43): tenant-defined rubric CRUD + on-demand scoring + read/aggregate
 * for the coaching + analytics views. All reads/writes run under `withTenant` (RLS), so a
 * tenant only ever touches its own rubrics/scores (self-audit B). The LLM completer is
 * INJECTED (RouterService in prod — metered, golden rule #4; a fake in tests), so scoring is
 * testable without a live model. The async/bulk path lives in the worker; this is the
 * interactive "score this call now" path plus the surfaces that read scores.
 */

/** Metered LLM completion — tenant-scoped, returns the model text + concrete model id. */
export type QaCompleter = (input: {
  tenantId: string;
  system: string;
  user: string;
}) => Promise<{ text: string; model: string }>;

/** A partial rubric update — every field optional and may be explicitly `undefined`. */
export type QaRubricUpdate = { [K in keyof QaRubricInput]?: QaRubricInput[K] | undefined };

export interface QaRubricRow {
  id: string;
  name: string;
  criteria: QaCriterion[];
  samplingRate: number;
  active: boolean;
  agentId: string | null;
  updatedAt: Date;
}

export interface QaScoreRow {
  id: string;
  callId: string;
  rubricId: string;
  overall: number;
  criteria: QaCriterionScore[];
  model: string;
  createdAt: Date;
}

const asCriteria = (v: unknown): QaCriterion[] => (Array.isArray(v) ? (v as QaCriterion[]) : []);
const asScores = (v: unknown): QaCriterionScore[] =>
  Array.isArray(v) ? (v as QaCriterionScore[]) : [];

export class QaService {
  constructor(
    private readonly db: PrismaService,
    private readonly complete: QaCompleter,
  ) {}

  // ── Rubric CRUD ─────────────────────────────────────────────────────────────

  async createRubric(tenantId: string, input: QaRubricInput): Promise<QaRubricRow> {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.qaRubric.create({
        data: {
          tenantId,
          name: input.name,
          criteria: input.criteria as unknown as object,
          samplingRate: input.samplingRate,
          active: input.active,
          ...(input.agentId ? { agentId: input.agentId } : {}),
        },
        select: SELECT_RUBRIC,
      }),
    );
    return toRubricRow(row);
  }

  async listRubrics(tenantId: string): Promise<QaRubricRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.qaRubric.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT_RUBRIC }),
    );
    return rows.map(toRubricRow);
  }

  async updateRubric(tenantId: string, id: string, input: QaRubricUpdate): Promise<QaRubricRow> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.qaRubric.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Rubric not found');
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.qaRubric.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.criteria !== undefined
            ? { criteria: input.criteria as unknown as object }
            : {}),
          ...(input.samplingRate !== undefined ? { samplingRate: input.samplingRate } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
        },
        select: SELECT_RUBRIC,
      }),
    );
    return toRubricRow(row);
  }

  async deleteRubric(tenantId: string, id: string): Promise<{ deleted: true }> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.qaRubric.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Rubric not found');
    await this.db.withTenant(tenantId, (tx) => tx.qaRubric.delete({ where: { id } }));
    return { deleted: true };
  }

  // ── Scoring (interactive) ─────────────────────────────────────────────────────

  /**
   * Score one call NOW against every active applicable rubric (ignores sampling — this is an
   * explicit manual trigger). Upserts a QaScore per rubric. RLS-scoped; metered via the
   * injected completer.
   */
  async scoreCallNow(tenantId: string, callId: string): Promise<QaScoreRow[]> {
    const call = await this.db.withTenant(tenantId, (tx) =>
      tx.call.findFirst({
        where: { id: callId },
        select: { agentId: true, transcript: { select: { segments: true } } },
      }),
    );
    if (!call) throw new NotFoundError('Call not found');
    const text = segmentsToText(call.transcript?.segments);
    if (!text) throw new NotFoundError('Call has no transcript to score');

    const rubrics = await this.db.withTenant(tenantId, (tx) =>
      tx.qaRubric.findMany({
        where: { active: true, OR: [{ agentId: null }, { agentId: call.agentId }] },
        select: { id: true, criteria: true },
      }),
    );

    const out: QaScoreRow[] = [];
    for (const rubric of rubrics) {
      const criteria = asCriteria(rubric.criteria);
      if (criteria.length === 0) continue;
      const { system, user } = buildQaPrompt(criteria, text);
      const { text: raw, model } = await this.complete({ tenantId, system, user });
      const scored = scoreQa(parseQaResult(raw, criteria));
      const saved = await this.db.withTenant(tenantId, (tx) =>
        tx.qaScore.upsert({
          where: { callId_rubricId: { callId, rubricId: rubric.id } },
          create: {
            tenantId,
            callId,
            rubricId: rubric.id,
            overall: scored.overall,
            criteria: scored.criteria as unknown as object,
            model,
          },
          update: {
            overall: scored.overall,
            criteria: scored.criteria as unknown as object,
            model,
          },
          select: SELECT_SCORE,
        }),
      );
      out.push(toScoreRow(saved));
    }
    return out;
  }

  // ── Reads (coaching / analytics) ──────────────────────────────────────────────

  async scoresForCall(tenantId: string, callId: string): Promise<QaScoreRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.qaScore.findMany({ where: { callId }, select: SELECT_SCORE }),
    );
    return rows.map(toScoreRow);
  }

  /** Aggregate scores over a window into per-rubric + per-criterion averages (coaching). */
  async aggregate(
    tenantId: string,
    params: { from?: Date; to?: Date; agentId?: string } = {},
  ): Promise<QaRubricAggregate[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.qaScore.findMany({
        where: {
          ...(params.from || params.to
            ? {
                createdAt: {
                  ...(params.from ? { gte: params.from } : {}),
                  ...(params.to ? { lt: params.to } : {}),
                },
              }
            : {}),
          ...(params.agentId ? { call: { agentId: params.agentId } } : {}),
        },
        select: { rubricId: true, overall: true, criteria: true },
      }),
    );
    return aggregateQaScores(
      rows.map((r) => ({
        rubricId: r.rubricId,
        overall: r.overall,
        criteria: asScores(r.criteria),
      })),
    );
  }
}

const SELECT_RUBRIC = {
  id: true,
  name: true,
  criteria: true,
  samplingRate: true,
  active: true,
  agentId: true,
  updatedAt: true,
} as const;

const SELECT_SCORE = {
  id: true,
  callId: true,
  rubricId: true,
  overall: true,
  criteria: true,
  model: true,
  createdAt: true,
} as const;

function toRubricRow(r: {
  id: string;
  name: string;
  criteria: unknown;
  samplingRate: number;
  active: boolean;
  agentId: string | null;
  updatedAt: Date;
}): QaRubricRow {
  return {
    id: r.id,
    name: r.name,
    criteria: asCriteria(r.criteria),
    samplingRate: r.samplingRate,
    active: r.active,
    agentId: r.agentId,
    updatedAt: r.updatedAt,
  };
}

function toScoreRow(r: {
  id: string;
  callId: string;
  rubricId: string;
  overall: number;
  criteria: unknown;
  model: string;
  createdAt: Date;
}): QaScoreRow {
  return {
    id: r.id,
    callId: r.callId,
    rubricId: r.rubricId,
    overall: r.overall,
    criteria: asScores(r.criteria),
    model: r.model,
    createdAt: r.createdAt,
  };
}
