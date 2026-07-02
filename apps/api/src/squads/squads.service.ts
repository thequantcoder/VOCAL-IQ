import { Injectable } from '@nestjs/common';
import {
  type HandoffRule,
  NotFoundError,
  ValidationError,
  squadConfigSchema,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface SquadListItem {
  id: string;
  name: string;
  memberCount: number;
  updatedAt: Date;
}

export interface SquadDetail {
  id: string;
  name: string;
  description: string | null;
  entryAgentId: string | null;
  handoffRules: HandoffRule[];
  members: Array<{ agentId: string; role: string; order: number }>;
  createdAt: Date;
  updatedAt: Date;
}

export const upsertSquadSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  entryAgentId: z.string().uuid().nullish(),
  members: z
    .array(
      z.object({
        agentId: z.string().uuid(),
        role: z.string().min(1).max(60),
        order: z.number().int().min(0).max(100).default(0),
      }),
    )
    .max(20)
    .default([]),
  handoffRules: z
    .array(
      z.object({
        fromAgentId: z.string().uuid(),
        on: z.string().min(1).max(60),
        toAgentId: z.string().uuid(),
      }),
    )
    .max(100)
    .default([]),
});

const SQUAD_SELECT = {
  id: true,
  name: true,
  description: true,
  entryAgentId: true,
  handoffRules: true,
  createdAt: true,
  updatedAt: true,
  members: { select: { agentId: true, role: true, order: true }, orderBy: { order: 'asc' } },
} as const;

type ParsedSquad = z.infer<typeof upsertSquadSchema>;

/**
 * Squad CRUD (Day 27): a squad chains specialist agents within one call. Every read/write
 * is RLS-scoped via `withTenant`, so a tenant only sees + edits its own squads and can
 * only enroll its OWN agents (verified inside the tenant tx — golden rule #1 / self-audit
 * B). Handoff rules are validated to reference only squad members (no dangling handoffs).
 */
@Injectable()
export class SquadsService {
  constructor(private readonly db: PrismaService) {}

  async list(tenantId: string): Promise<SquadListItem[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.squad.findMany({
        select: { id: true, name: true, updatedAt: true, _count: { select: { members: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      memberCount: r._count.members,
      updatedAt: r.updatedAt,
    }));
  }

  async get(tenantId: string, id: string): Promise<SquadDetail> {
    const squad = await this.db.withTenant(tenantId, (tx) =>
      tx.squad.findFirst({ where: { id }, select: SQUAD_SELECT }),
    );
    if (!squad) throw new NotFoundError('Squad not found');
    return this.toDetail(squad);
  }

  async create(tenantId: string, input: unknown): Promise<SquadDetail> {
    const data = this.parse(input);
    const id = await this.db.withTenant(tenantId, async (tx) => {
      const agentIds = [...new Set(data.members.map((m) => m.agentId))];
      if (agentIds.length > 0) {
        const found = await tx.agent.count({ where: { id: { in: agentIds } } });
        if (found !== agentIds.length) {
          throw new ValidationError('One or more agents do not belong to this tenant');
        }
      }
      const squad = await tx.squad.create({
        data: {
          tenantId,
          name: data.name,
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.entryAgentId ? { entryAgentId: data.entryAgentId } : {}),
          handoffRules: data.handoffRules,
          members: {
            create: data.members.map((m) => ({
              tenantId,
              agentId: m.agentId,
              role: m.role,
              order: m.order,
            })),
          },
        },
        select: { id: true },
      });
      return squad.id;
    });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: unknown): Promise<SquadDetail> {
    const data = this.parse(input);
    await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.squad.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Squad not found');
      const agentIds = [...new Set(data.members.map((m) => m.agentId))];
      if (agentIds.length > 0) {
        const found = await tx.agent.count({ where: { id: { in: agentIds } } });
        if (found !== agentIds.length) {
          throw new ValidationError('One or more agents do not belong to this tenant');
        }
      }
      // Replace members wholesale (small sets; keeps the API simple + consistent).
      await tx.squadMember.deleteMany({ where: { squadId: id } });
      await tx.squad.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description ?? null,
          entryAgentId: data.entryAgentId ?? null,
          handoffRules: data.handoffRules,
          members: {
            create: data.members.map((m) => ({
              tenantId,
              agentId: m.agentId,
              role: m.role,
              order: m.order,
            })),
          },
        },
      });
    });
    return this.get(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.squad.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Squad not found');
      await tx.squad.delete({ where: { id } });
      return { id };
    });
  }

  /** Validate name/members + handoff-rule integrity (rules must reference members). */
  private parse(input: unknown): ParsedSquad {
    const parsed = upsertSquadSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid squad');
    }
    // Reuse the shared cross-field invariant (rules/entry reference members only).
    const check = squadConfigSchema.safeParse({
      entryAgentId: parsed.data.entryAgentId ?? undefined,
      members: parsed.data.members,
      handoffRules: parsed.data.handoffRules,
    });
    if (!check.success) {
      throw new ValidationError(check.error.issues[0]?.message ?? 'Invalid squad handoff rules');
    }
    return parsed.data;
  }

  private toDetail(squad: {
    id: string;
    name: string;
    description: string | null;
    entryAgentId: string | null;
    handoffRules: unknown;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{ agentId: string; role: string; order: number }>;
  }): SquadDetail {
    return {
      id: squad.id,
      name: squad.name,
      description: squad.description,
      entryAgentId: squad.entryAgentId,
      handoffRules: (squad.handoffRules as HandoffRule[]) ?? [],
      members: squad.members,
      createdAt: squad.createdAt,
      updatedAt: squad.updatedAt,
    };
  }
}
