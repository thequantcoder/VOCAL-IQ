import {
  CampaignContactStatus,
  CampaignStatus,
  type CampaignStatus as CampaignStatusT,
  NotFoundError,
  ValidationError,
  callWindowSchema,
  importContacts,
  retryPolicySchema,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface CampaignListItem {
  id: string;
  name: string;
  status: string;
  contactCount: number;
  createdAt: Date;
}

export interface CampaignDetail {
  id: string;
  name: string;
  agentId: string;
  status: string;
  schedule: unknown;
  pacing: number;
  concurrency: number;
  retryPolicy: unknown;
  createdAt: Date;
}

export interface ImportSummary {
  imported: number;
  invalid: number;
  duplicates: number;
  suppressed: number;
}

export interface MonitorSummary {
  total: number;
  byStatus: Record<string, number>;
}

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  agentId: z.string().uuid(),
  schedule: callWindowSchema.optional(),
  pacing: z.number().int().min(1).max(1000).default(10),
  concurrency: z.number().int().min(1).max(200).default(5),
  retryPolicy: retryPolicySchema.optional(),
});

export const importSchema = z.object({
  csv: z.string().min(1).max(5_000_000), // ~5MB paste/upload cap
  mapping: z.object({
    phone: z.string().min(1),
    name: z.string().optional(),
    email: z.string().optional(),
  }),
});

const VALID_TRANSITIONS: Record<string, CampaignStatusT[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.SCHEDULED, CampaignStatus.RUNNING],
  [CampaignStatus.SCHEDULED]: [CampaignStatus.RUNNING, CampaignStatus.PAUSED, CampaignStatus.DRAFT],
  [CampaignStatus.RUNNING]: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED],
  [CampaignStatus.PAUSED]: [CampaignStatus.RUNNING, CampaignStatus.COMPLETED],
  [CampaignStatus.COMPLETED]: [],
};

/**
 * Campaign manager (Day 28): CRUD, CSV import (dedupe + DNC suppression), status
 * transitions, and live monitoring. Every read/write is RLS-scoped via `withTenant`, so a
 * tenant only touches its own campaigns/contacts (golden rule #1). Import suppresses the
 * tenant's DNC numbers up front (self-audit C) and counts every dropped row (no silent
 * loss). Actual dialing is the scheduler worker's job — this service never dials.
 */
export class CampaignsService {
  constructor(private readonly db: PrismaService) {}

  async list(tenantId: string): Promise<CampaignListItem[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.campaign.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          _count: { select: { contacts: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      contactCount: r._count.contacts,
      createdAt: r.createdAt,
    }));
  }

  async get(tenantId: string, id: string): Promise<CampaignDetail> {
    const c = await this.db.withTenant(tenantId, (tx) =>
      tx.campaign.findFirst({
        where: { id },
        select: {
          id: true,
          name: true,
          agentId: true,
          status: true,
          scheduleJson: true,
          pacing: true,
          concurrency: true,
          retryPolicy: true,
          createdAt: true,
        },
      }),
    );
    if (!c) throw new NotFoundError('Campaign not found');
    return {
      id: c.id,
      name: c.name,
      agentId: c.agentId,
      status: c.status,
      schedule: c.scheduleJson,
      pacing: c.pacing,
      concurrency: c.concurrency,
      retryPolicy: c.retryPolicy,
      createdAt: c.createdAt,
    };
  }

  async create(tenantId: string, input: unknown): Promise<CampaignDetail> {
    const parsed = createCampaignSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid campaign');
    }
    const data = parsed.data;
    const id = await this.db.withTenant(tenantId, async (tx) => {
      // Agent must be visible to this tenant (RLS scopes the lookup).
      const agent = await tx.agent.findFirst({ where: { id: data.agentId }, select: { id: true } });
      if (!agent) throw new ValidationError('Agent does not belong to this tenant');
      const created = await tx.campaign.create({
        data: {
          tenantId,
          name: data.name,
          agentId: data.agentId,
          status: CampaignStatus.DRAFT,
          scheduleJson: data.schedule ?? {},
          pacing: data.pacing,
          concurrency: data.concurrency,
          retryPolicy: data.retryPolicy ?? {},
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(tenantId, id);
  }

  /** Move a campaign through its lifecycle, rejecting illegal transitions. */
  async setStatus(tenantId: string, id: string, next: string): Promise<CampaignDetail> {
    if (!Object.values(CampaignStatus).includes(next as CampaignStatusT)) {
      throw new ValidationError('Unknown status');
    }
    await this.db.withTenant(tenantId, async (tx) => {
      const c = await tx.campaign.findFirst({ where: { id }, select: { status: true } });
      if (!c) throw new NotFoundError('Campaign not found');
      const allowed = VALID_TRANSITIONS[c.status] ?? [];
      if (!allowed.includes(next as CampaignStatusT)) {
        throw new ValidationError(`Cannot move from ${c.status} to ${next}`);
      }
      await tx.campaign.update({ where: { id }, data: { status: next } });
    });
    return this.get(tenantId, id);
  }

  /**
   * Import contacts from CSV: dedupe by phone, suppress the tenant's DNC numbers, upsert
   * Contact rows, and enroll them as PENDING campaign contacts. Returns the counts of
   * everything dropped so the UI can report it. DNC is enforced here up front — a
   * suppressed number never becomes a campaign contact (self-audit C).
   */
  async import(tenantId: string, campaignId: string, input: unknown): Promise<ImportSummary> {
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid import');
    }
    return this.db.withTenant(tenantId, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId },
        select: { id: true },
      });
      if (!campaign) throw new NotFoundError('Campaign not found');

      // Tenant DNC set: any contact flagged do-not-call.
      const dncRows = await tx.contact.findMany({
        where: { dnc: true, phone: { not: null } },
        select: { phone: true },
      });
      const dnc = new Set(dncRows.map((r) => r.phone as string));

      const m = parsed.data.mapping;
      const mapping = {
        phone: m.phone,
        ...(m.name ? { name: m.name } : {}),
        ...(m.email ? { email: m.email } : {}),
      };
      const result = importContacts(parsed.data.csv, mapping, dnc);

      let imported = 0;
      for (const c of result.contacts) {
        // Upsert the Contact by (tenant, phone) — reuse existing contacts across campaigns.
        const existing = await tx.contact.findFirst({
          where: { phone: c.phone },
          select: { id: true },
        });
        const contactId =
          existing?.id ??
          (
            await tx.contact.create({
              data: {
                tenantId,
                phone: c.phone,
                ...(c.name ? { name: c.name } : {}),
                ...(c.email ? { email: c.email } : {}),
                fields: c.fields,
                source: 'campaign-import',
              },
              select: { id: true },
            })
          ).id;

        // Enroll (idempotent on the unique [campaignId, contactId]).
        const already = await tx.campaignContact.findFirst({
          where: { campaignId, contactId },
          select: { id: true },
        });
        if (already) {
          result.duplicates++;
          continue;
        }
        await tx.campaignContact.create({
          data: {
            tenantId,
            campaignId,
            contactId,
            status: CampaignContactStatus.PENDING,
          },
        });
        imported++;
      }

      return {
        imported,
        invalid: result.invalid,
        duplicates: result.duplicates,
        suppressed: result.suppressed,
      };
    });
  }

  /** Live monitor: contact counts grouped by status (pending/calling/completed/failed…). */
  async monitor(tenantId: string, campaignId: string): Promise<MonitorSummary> {
    return this.db.withTenant(tenantId, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId },
        select: { id: true },
      });
      if (!campaign) throw new NotFoundError('Campaign not found');
      const grouped = await tx.campaignContact.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { _all: true },
      });
      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const g of grouped) {
        byStatus[g.status] = g._count._all;
        total += g._count._all;
      }
      return { total, byStatus };
    });
  }
}
