import { Injectable } from '@nestjs/common';
import {
  type CallOutcome,
  type ExperimentMetric,
  type ExperimentVariant,
  NotFoundError,
  ValidationError,
  aggregateResults,
  assignVariant,
  experimentConfigSchema,
  twoProportionTest,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface ExperimentListItem {
  id: string;
  name: string;
  status: string;
  metric: string;
  variantCount: number;
  updatedAt: Date;
}

export interface ExperimentDetail {
  id: string;
  name: string;
  status: string;
  metric: ExperimentMetric;
  variants: ExperimentVariant[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VariantResultRow {
  variant: string;
  label: string;
  total: number;
  conversions: number;
  rate: number;
  isControl: boolean;
  lift: number;
  pValue: number;
  significant: boolean;
}

export interface ExperimentResults {
  metric: string;
  totalCalls: number;
  rows: VariantResultRow[];
}

export const createExperimentSchema = z.object({
  name: z.string().min(1).max(120),
  metric: z.enum(['conversion', 'booking', 'csat']).default('conversion'),
  variants: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().min(1).max(80),
        weight: z.number().int().min(1).max(1000).default(1),
        // Variant overrides (opener/voiceId/script) are scalar → JSON-safe when persisted.
        config: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .default({}),
      }),
    )
    .min(2)
    .max(10),
});

const EXPERIMENT_STATUSES = ['DRAFT', 'RUNNING', 'STOPPED'] as const;

/**
 * A/B experiments (Day 30): define variants + a success metric, route calls across them,
 * and compare outcomes with significance. Every read/write is RLS-scoped via `withTenant`
 * (self-audit B). Assignment + stats use the pure, unit-tested shared helpers (self-audit
 * A). This service never dials — it assigns a stable variant the caller records on the Call.
 */
@Injectable()
export class ExperimentsService {
  constructor(private readonly db: PrismaService) {}

  async list(tenantId: string): Promise<ExperimentListItem[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.experiment.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          metric: true,
          variants: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      metric: r.metric,
      variantCount: Array.isArray(r.variants) ? (r.variants as unknown[]).length : 0,
      updatedAt: r.updatedAt,
    }));
  }

  async get(tenantId: string, id: string): Promise<ExperimentDetail> {
    const e = await this.db.withTenant(tenantId, (tx) =>
      tx.experiment.findFirst({
        where: { id },
        select: {
          id: true,
          name: true,
          status: true,
          metric: true,
          variants: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
    if (!e) throw new NotFoundError('Experiment not found');
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      metric: e.metric as ExperimentMetric,
      variants: (e.variants as ExperimentVariant[]) ?? [],
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  async create(tenantId: string, input: unknown): Promise<ExperimentDetail> {
    const parsed = createExperimentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid experiment');
    }
    // Enforce the shared cross-field invariants (≥2 variants, unique ids).
    const check = experimentConfigSchema.safeParse({
      metric: parsed.data.metric,
      variants: parsed.data.variants,
    });
    if (!check.success) {
      throw new ValidationError(check.error.issues[0]?.message ?? 'Invalid experiment variants');
    }
    const id = await this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.experiment.create({
        data: {
          tenantId,
          name: parsed.data.name,
          metric: parsed.data.metric,
          status: 'DRAFT',
          variants: parsed.data.variants,
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(tenantId, id);
  }

  async setStatus(tenantId: string, id: string, status: string): Promise<ExperimentDetail> {
    if (!(EXPERIMENT_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError('Unknown status');
    }
    await this.db.withTenant(tenantId, async (tx) => {
      const e = await tx.experiment.findFirst({ where: { id }, select: { id: true } });
      if (!e) throw new NotFoundError('Experiment not found');
      await tx.experiment.update({ where: { id }, data: { status } });
    });
    return this.get(tenantId, id);
  }

  /**
   * Assign a stable variant for a routing key (contactId/callId). Only RUNNING experiments
   * assign; returns the variant id + its config so the caller applies the override and
   * records `experimentId`/`variant` on the Call. Deterministic (self-audit A).
   */
  async assign(
    tenantId: string,
    id: string,
    key: string,
  ): Promise<{ variant: string; config: Record<string, unknown> } | null> {
    const exp = await this.get(tenantId, id);
    if (exp.status !== 'RUNNING') return null;
    const variant = assignVariant(exp.variants, key);
    if (!variant) return null;
    const chosen = exp.variants.find((v) => v.id === variant);
    return { variant, config: (chosen?.config as Record<string, unknown>) ?? {} };
  }

  /**
   * Per-variant results with significance vs the control (first variant). Reads only this
   * experiment's calls (RLS-scoped) and folds them through the pure aggregation + z-test.
   */
  async results(tenantId: string, id: string): Promise<ExperimentResults> {
    const exp = await this.get(tenantId, id);
    const calls = (await this.db.withTenant(tenantId, (tx) =>
      tx.call.findMany({
        where: { experimentId: id },
        select: { variant: true, disposition: true, sentiment: true },
      }),
    )) as CallOutcome[];

    const agg = aggregateResults(exp.metric, calls);
    const byVariant = new Map(agg.map((a) => [a.variant, a]));
    const control = exp.variants[0];
    const controlAgg = control ? byVariant.get(control.id) : undefined;

    const rows: VariantResultRow[] = exp.variants.map((v) => {
      const a = byVariant.get(v.id) ?? { variant: v.id, total: 0, conversions: 0, rate: 0 };
      const isControl = control?.id === v.id;
      const sig =
        isControl || !controlAgg
          ? { lift: 0, pValue: 1, significant: false }
          : twoProportionTest(controlAgg.conversions, controlAgg.total, a.conversions, a.total);
      return {
        variant: v.id,
        label: v.label,
        total: a.total,
        conversions: a.conversions,
        rate: a.rate,
        isControl,
        lift: sig.lift,
        pValue: sig.pValue,
        significant: sig.significant,
      };
    });

    return { metric: exp.metric, totalCalls: calls.length, rows };
  }
}
