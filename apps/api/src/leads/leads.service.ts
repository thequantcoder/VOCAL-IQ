import { Injectable } from '@nestjs/common';
import {
  LeadStatus,
  type LeadStatus as LeadStatusT,
  NotFoundError,
  ValidationError,
  canTransition,
  isValidStage,
  scoreLead,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface LeadListItem {
  id: string;
  contactId: string;
  contactName: string | null;
  phone: string | null;
  tags: string[];
  status: LeadStatusT;
  score: number;
  pipelineStage: string | null;
  owner: string | null;
  updatedAt: Date;
}

export interface LeadDetail extends LeadListItem {
  dynamicVars: Record<string, unknown>;
  fields: Record<string, unknown>;
  createdAt: Date;
}

export const createLeadSchema = z.object({ contactId: z.string().uuid() });

export const updateLeadSchema = z.object({
  owner: z.string().uuid().nullish(),
  // Dynamic vars are scalar (templated into scripts as strings), so they're JSON-safe.
  dynamicVars: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  tags: z.array(z.string().max(40)).max(50).optional(),
});

const LEAD_SELECT = {
  id: true,
  contactId: true,
  status: true,
  score: true,
  pipelineStage: true,
  owner: true,
  dynamicVars: true,
  createdAt: true,
  updatedAt: true,
  contact: { select: { name: true, phone: true, tags: true, fields: true } },
} as const;

type LeadRow = {
  id: string;
  contactId: string;
  status: LeadStatusT;
  score: number;
  pipelineStage: string | null;
  owner: string | null;
  dynamicVars: unknown;
  createdAt: Date;
  updatedAt: Date;
  contact: { name: string | null; phone: string | null; tags: string[]; fields: unknown };
};

function toDetail(row: LeadRow): LeadDetail {
  return {
    id: row.id,
    contactId: row.contactId,
    contactName: row.contact.name,
    phone: row.contact.phone,
    tags: row.contact.tags,
    status: row.status,
    score: row.score,
    pipelineStage: row.pipelineStage,
    owner: row.owner,
    dynamicVars: (row.dynamicVars as Record<string, unknown>) ?? {},
    fields: (row.contact.fields as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Lead workspace (Day 29): a scored pipeline over contacts. Every read/write is RLS-scoped
 * via `withTenant` (self-audit B). Auto Hot/Warm/Cold scoring uses the pure `scoreLead`
 * (self-audit A) and pipeline moves are guarded by `canTransition`. Dynamic vars personalise
 * the agent script at call time; tags/custom fields live on the shared Contact.
 */
@Injectable()
export class LeadsService {
  constructor(private readonly db: PrismaService) {}

  async list(
    tenantId: string,
    filter: {
      status?: string | undefined;
      stage?: string | undefined;
      owner?: string | undefined;
    } = {},
  ): Promise<LeadListItem[]> {
    const where: Record<string, unknown> = {};
    if (filter.status && Object.values(LeadStatus).includes(filter.status as LeadStatusT)) {
      where.status = filter.status;
    }
    if (filter.stage) where.pipelineStage = filter.stage;
    if (filter.owner) where.owner = filter.owner;
    const rows = (await this.db.withTenant(tenantId, (tx) =>
      tx.lead.findMany({ where, select: LEAD_SELECT, orderBy: { updatedAt: 'desc' } }),
    )) as LeadRow[];
    return rows.map(toDetail);
  }

  async get(tenantId: string, id: string): Promise<LeadDetail> {
    const row = (await this.db.withTenant(tenantId, (tx) =>
      tx.lead.findFirst({ where: { id }, select: LEAD_SELECT }),
    )) as LeadRow | null;
    if (!row) throw new NotFoundError('Lead not found');
    return toDetail(row);
  }

  async create(tenantId: string, input: unknown): Promise<LeadDetail> {
    const parsed = createLeadSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid lead');
    const id = await this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: parsed.data.contactId },
        select: { id: true },
      });
      if (!contact) throw new ValidationError('Contact does not belong to this tenant');
      // One lead per contact — reuse if it exists.
      const existing = await tx.lead.findFirst({
        where: { contactId: parsed.data.contactId },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await tx.lead.create({
        data: {
          tenantId,
          contactId: parsed.data.contactId,
          status: LeadStatus.NEW,
          pipelineStage: 'NEW',
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: unknown): Promise<LeadDetail> {
    const parsed = updateLeadSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid lead update');
    const data = parsed.data;
    await this.db.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id },
        select: { id: true, contactId: true },
      });
      if (!lead) throw new NotFoundError('Lead not found');
      await tx.lead.update({
        where: { id },
        data: {
          ...(data.owner !== undefined ? { owner: data.owner } : {}),
          ...(data.dynamicVars !== undefined ? { dynamicVars: data.dynamicVars } : {}),
        },
      });
      // Tags/custom fields live on the shared Contact.
      if (data.tags !== undefined) {
        await tx.contact.update({ where: { id: lead.contactId }, data: { tags: data.tags } });
      }
    });
    return this.get(tenantId, id);
  }

  /** Move a lead along the Quick-CRM pipeline, rejecting illegal transitions. */
  async moveStage(tenantId: string, id: string, stage: string): Promise<LeadDetail> {
    if (!isValidStage(stage)) throw new ValidationError('Unknown pipeline stage');
    await this.db.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id }, select: { pipelineStage: true } });
      if (!lead) throw new NotFoundError('Lead not found');
      if (!canTransition(lead.pipelineStage ?? 'NEW', stage)) {
        throw new ValidationError(`Cannot move from ${lead.pipelineStage} to ${stage}`);
      }
      await tx.lead.update({ where: { id }, data: { pipelineStage: stage } });
    });
    return this.get(tenantId, id);
  }

  /**
   * Apply auto-scoring after a call: derive score + Hot/Warm/Cold from the call signals and
   * persist them. Deterministic via the shared `scoreLead` (self-audit A). Returns the lead.
   */
  async applyScore(tenantId: string, id: string, signals: unknown): Promise<LeadDetail> {
    const { score, temperature } = scoreLead(signals);
    await this.db.withTenant(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id }, select: { id: true } });
      if (!lead) throw new NotFoundError('Lead not found');
      await tx.lead.update({ where: { id }, data: { score, status: temperature } });
    });
    return this.get(tenantId, id);
  }
}
