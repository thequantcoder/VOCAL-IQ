import {
  type DeskAgent,
  NotFoundError,
  type PresenceInput,
  type TransferRequestInput,
  ValidationError,
  buildWarmSummary,
  pickDeskAgent,
  presenceInputSchema,
  summarizeQueue,
  transferRequestSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Agent Desk (Day 67) — the server side of the human-agent transfer surface. Human agents set
 * presence; the Transfer node / an escalation enqueues a `TransferRequest` and this routes it to an
 * available human (pure `pickDeskAgent`); an agent claims a call, then dispositions it (write-back
 * to the Call + analytics/cost, reusing the outbound disposition path). Everything is RLS-scoped
 * (self-audit B) and RBAC-gated (only AGENT+ claim; ADMIN/OWNER supervise). The realtime presence
 * broadcast + LiveKit join ride the existing live-loop transport (the thin live layer).
 */

export interface Actor {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: string;
}

export class DeskService {
  constructor(private readonly db: PrismaService) {}

  /** A human agent sets their availability + skills. */
  async setPresence(actor: Actor, input: unknown): Promise<{ status: string; skills: string[] }> {
    const parsed = presenceInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid presence');
    const data: PresenceInput = parsed.data;
    const row = await this.db.withTenant(actor.tenantId, async (tx) => {
      const existing = await tx.agentPresence.findUnique({
        where: { membershipId: actor.membershipId },
        select: { id: true },
      });
      if (existing) {
        return tx.agentPresence.update({
          where: { id: existing.id },
          data: { status: data.status, skills: data.skills },
          select: { status: true, skills: true },
        });
      }
      return tx.agentPresence.create({
        data: {
          tenantId: actor.tenantId,
          membershipId: actor.membershipId,
          userId: actor.userId,
          status: data.status,
          skills: data.skills,
        },
        select: { status: true, skills: true },
      });
    });
    return row;
  }

  /** The tenant's available desk agents (for supervisors / routing preview). */
  async availableAgents(tenantId: string): Promise<DeskAgent[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.agentPresence.findMany({ select: PRESENCE_SELECT }),
    );
    return rows.map(toDeskAgent);
  }

  /**
   * Enqueue a human transfer for a live call and try to route it immediately. Returns the request
   * + the assigned agent (or null → it waits in the queue for the next available agent).
   */
  async requestTransfer(
    tenantId: string,
    input: unknown,
    ctx: { contactName?: string; leadScore?: number; reason?: string; aiSummary?: string } = {},
  ): Promise<{
    id: string;
    assignedMembershipId: string | null;
    status: string;
    warmSummary: string | null;
  }> {
    const parsed = transferRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid transfer request');
    const req: TransferRequestInput = parsed.data;

    const agents = await this.availableAgents(tenantId);
    const chosen = pickDeskAgent(agents, {
      strategy: req.strategy,
      ...(req.requiredSkill ? { requiredSkill: req.requiredSkill } : {}),
      ...(req.specificMembershipId ? { specificMembershipId: req.specificMembershipId } : {}),
    });
    const warmSummary = req.handoffType === 'warm' ? buildWarmSummary(ctx) : null;

    return this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.transferRequest.create({
        data: {
          tenantId,
          callId: req.callId,
          handoffType: req.handoffType,
          strategy: req.strategy,
          requiredSkill: req.requiredSkill ?? null,
          warmSummary,
          status: chosen ? 'ringing' : 'queued',
          assignedMembershipId: chosen?.membershipId ?? null,
        },
        select: { id: true, assignedMembershipId: true, status: true, warmSummary: true },
      });
      if (chosen) {
        await tx.agentPresence.update({
          where: { membershipId: chosen.membershipId },
          data: { lastAssignedAt: new Date() },
        });
      }
      return created;
    });
  }

  /** A human agent claims a ringing/queued transfer → joins the call. AGENT+ only (route-gated). */
  async claim(actor: Actor, transferId: string): Promise<{ id: string; status: string }> {
    const t = await this.load(actor.tenantId, transferId);
    if (t.status === 'active' || t.status === 'completed') {
      throw new ValidationError('This transfer is no longer claimable');
    }
    return this.db.withTenant(actor.tenantId, async (tx) => {
      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: {
          status: 'active',
          assignedMembershipId: actor.membershipId,
          answeredAt: new Date(),
        },
        select: { id: true, status: true },
      });
      await tx.agentPresence.updateMany({
        where: { membershipId: actor.membershipId },
        data: { activeCalls: { increment: 1 }, lastAssignedAt: new Date() },
      });
      return updated;
    });
  }

  /** No-answer fallback: release the assignment back to the queue for re-routing. */
  async noAnswer(tenantId: string, transferId: string): Promise<{ id: string; status: string }> {
    await this.load(tenantId, transferId);
    return this.db.withTenant(tenantId, (tx) =>
      tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'queued', assignedMembershipId: null },
        select: { id: true, status: true },
      }),
    );
  }

  /**
   * Disposition + wrap-up after the human call ends: closes the transfer, frees the agent, and
   * writes the disposition/notes back to the Call (feeding analytics + cost like any call).
   */
  async disposition(
    actor: Actor,
    transferId: string,
    input: { disposition: string; notes?: string; durationSec?: number },
  ): Promise<{ id: string; status: string }> {
    if (!input.disposition?.trim()) throw new ValidationError('A disposition is required');
    const t = await this.load(actor.tenantId, transferId);
    return this.db.withTenant(actor.tenantId, async (tx) => {
      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'completed', endedAt: new Date() },
        select: { id: true, status: true },
      });
      // Free the agent's capacity.
      if (t.assignedMembershipId) {
        await tx.agentPresence.updateMany({
          where: { membershipId: t.assignedMembershipId, activeCalls: { gt: 0 } },
          data: { activeCalls: { decrement: 1 } },
        });
      }
      // Write disposition back to the Call (human-handled minutes still metered downstream).
      await tx.call.updateMany({
        where: { id: t.callId },
        data: {
          disposition: input.disposition.trim(),
          status: 'COMPLETED',
          endedAt: new Date(),
          ...(input.durationSec != null ? { durationSec: input.durationSec } : {}),
        },
      });
      return updated;
    });
  }

  /** Queue + SLA view (supervisor: ADMIN/OWNER; agents see their own assignments). */
  async queue(actor: Actor): Promise<ReturnType<typeof summarizeQueue> & { supervisor: boolean }> {
    const supervisor =
      actor.role === 'OWNER' || actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN';
    const rows = await this.db.withTenant(actor.tenantId, (tx) =>
      tx.transferRequest.findMany({
        where: {
          status: { in: ['queued', 'ringing', 'active'] },
          ...(supervisor ? {} : { assignedMembershipId: actor.membershipId }),
        },
        select: {
          callId: true,
          waitStartedAt: true,
          handoffType: true,
          assignedMembershipId: true,
        },
        orderBy: { waitStartedAt: 'asc' },
        take: 200,
      }),
    );
    const summary = summarizeQueue(
      rows.map((r) => ({
        callId: r.callId,
        waitStartedAt: r.waitStartedAt.getTime(),
        handoffType: r.handoffType as 'warm' | 'cold',
        assignedMembershipId: r.assignedMembershipId,
      })),
      Date.now(),
    );
    return { ...summary, supervisor };
  }

  private async load(tenantId: string, id: string) {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.transferRequest.findFirst({
        where: { id },
        select: { id: true, status: true, callId: true, assignedMembershipId: true },
      }),
    );
    if (!t) throw new NotFoundError('Transfer not found');
    return t;
  }
}

const PRESENCE_SELECT = {
  membershipId: true,
  userId: true,
  status: true,
  skills: true,
  activeCalls: true,
  lastAssignedAt: true,
} as const;

function toDeskAgent(r: {
  membershipId: string;
  userId: string;
  status: string;
  skills: string[];
  activeCalls: number;
  lastAssignedAt: Date | null;
}): DeskAgent {
  return {
    membershipId: r.membershipId,
    userId: r.userId,
    status: r.status as DeskAgent['status'],
    skills: r.skills,
    activeCalls: r.activeCalls,
    lastAssignedAt: r.lastAssignedAt ? r.lastAssignedAt.getTime() : null,
  };
}
