import {
  type AgentMemoryData,
  type MemoryFact,
  NotFoundError,
  ValidationError,
  agentMemorySchema,
  mergeMemoryFacts,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface MemoryDto {
  agentId: string;
  summary: string;
  facts: MemoryFact[];
  lastCallId: string | null;
  updatedAt: Date;
}

type MemoryRow = {
  agentId: string;
  summary: string | null;
  facts: unknown;
  lastCallId: string | null;
  updatedAt: Date;
};

function toDto(row: MemoryRow): MemoryDto {
  return {
    agentId: row.agentId,
    summary: row.summary ?? '',
    facts: (row.facts as MemoryFact[]) ?? [],
    lastCallId: row.lastCallId,
    updatedAt: row.updatedAt,
  };
}

/**
 * Cross-call Agent Memory (Day 34). Durable per-(tenant, agent, contact) facts. Every path
 * is RLS-scoped via `withTenant`, so a tenant only ever sees/edits its own contacts' memory
 * (self-audit B — critical). Writes are gated on the agent's `memoryEnabled` (opt-in);
 * contact-level erase is an always-on GDPR path (self-audit C).
 */
export class MemoryService {
  constructor(private readonly db: PrismaService) {}

  /** All per-agent memory rows for one contact (the view/edit surface). */
  async getForContact(tenantId: string, contactId: string): Promise<MemoryDto[]> {
    const rows = (await this.db.withTenant(tenantId, (tx) =>
      tx.agentMemory.findMany({
        where: { contactId },
        select: { agentId: true, summary: true, facts: true, lastCallId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    )) as MemoryRow[];
    return rows.map(toDto);
  }

  /** One agent's memory of a contact — injected at call start (null if none / memory off). */
  async getForAgent(
    tenantId: string,
    agentId: string,
    contactId: string,
  ): Promise<MemoryDto | null> {
    const row = (await this.db.withTenant(tenantId, (tx) =>
      tx.agentMemory.findFirst({
        where: { agentId, contactId },
        select: { agentId: true, summary: true, facts: true, lastCallId: true, updatedAt: true },
      }),
    )) as MemoryRow | null;
    return row ? toDto(row) : null;
  }

  /**
   * Merge new facts into an agent's memory of a contact. No-op (returns null) unless the
   * agent has `memoryEnabled` — memory is opt-in. New facts overwrite same-key facts.
   */
  async upsert(
    tenantId: string,
    agentId: string,
    contactId: string,
    input: unknown,
    lastCallId?: string,
  ): Promise<MemoryDto | null> {
    const parsed = agentMemorySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid memory payload');
    const data: AgentMemoryData = parsed.data;

    return this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({
        where: { id: agentId },
        select: { id: true, memoryEnabled: true },
      });
      if (!agent) throw new ValidationError('Agent does not belong to this tenant');
      if (!agent.memoryEnabled) return null; // opt-in: skip when memory is off
      const contact = await tx.contact.findFirst({
        where: { id: contactId },
        select: { id: true },
      });
      if (!contact) throw new ValidationError('Contact does not belong to this tenant');

      const existing = (await tx.agentMemory.findFirst({
        where: { agentId, contactId },
        select: { facts: true },
      })) as { facts: unknown } | null;
      const mergedFacts = mergeMemoryFacts((existing?.facts as MemoryFact[]) ?? [], data.facts);

      const row = (await tx.agentMemory.upsert({
        where: { tenantId_agentId_contactId: { tenantId, agentId, contactId } },
        create: {
          tenantId,
          agentId,
          contactId,
          summary: data.summary,
          facts: mergedFacts,
          ...(lastCallId ? { lastCallId } : {}),
        },
        update: {
          summary: data.summary,
          facts: mergedFacts,
          ...(lastCallId ? { lastCallId } : {}),
        },
        select: { agentId: true, summary: true, facts: true, lastCallId: true, updatedAt: true },
      })) as MemoryRow;
      return toDto(row);
    });
  }

  /** GDPR: erase ALL memory of a contact (across agents). Always available. */
  async eraseContact(tenantId: string, contactId: string): Promise<{ erased: number }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId },
        select: { id: true },
      });
      if (!contact) throw new NotFoundError('Contact not found');
      const res = await tx.agentMemory.deleteMany({ where: { contactId } });
      return { erased: res.count };
    });
  }

  /** Retention: delete memory older than `retentionDays` (0 = keep forever → no-op). */
  async prune(tenantId: string, retentionDays: number): Promise<{ pruned: number }> {
    if (retentionDays <= 0) return { pruned: 0 };
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return this.db.withTenant(tenantId, async (tx) => {
      const res = await tx.agentMemory.deleteMany({ where: { updatedAt: { lt: cutoff } } });
      return { pruned: res.count };
    });
  }
}
