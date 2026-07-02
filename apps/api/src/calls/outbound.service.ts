import {
  CallChannel,
  CallDirection,
  CallStatus,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  TERMINAL_CALL_STATUSES,
  ValidationError,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';
import type { Dialer } from './dialer';

/** E.164: leading +, country digit 1-9, up to 15 total digits. */
const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Lawful basis to dial (TCPA-style). Every outbound call must assert one; it is
 * validated + returned for the audit trail. Real per-region rules land with compliance
 * (Day 60/71); this enforces that a basis is always chosen.
 */
export const CONSENT_BASES = [
  'EXPRESS_WRITTEN',
  'EXPRESS_ORAL',
  'EXISTING_RELATIONSHIP',
  'SOFT_OPT_IN',
] as const;

export const outboundSchema = z.object({
  agentId: z.string().uuid(),
  to: z.string().regex(E164, 'to must be an E.164 number'),
  contactId: z.string().uuid().optional(),
  flowVersionId: z.string().uuid().optional(),
  consentBasis: z.enum(CONSENT_BASES),
  from: z.string().regex(E164).optional(),
});
export type OutboundInput = z.infer<typeof outboundSchema>;

const dispositionSchema = z.object({
  disposition: z.string().min(1).max(64),
  status: z.enum([
    CallStatus.COMPLETED,
    CallStatus.FAILED,
    CallStatus.VOICEMAIL,
    CallStatus.NO_ANSWER,
  ]),
  durationSec: z.number().int().nonnegative().optional(),
  recordingUrl: z.string().url().optional(),
  costBreakdown: z.record(z.string(), z.number().nonnegative()).optional(),
});

/** Non-terminal statuses that count against the live concurrency cap. */
const ACTIVE_STATUSES = [CallStatus.QUEUED, CallStatus.RINGING, CallStatus.IN_PROGRESS];

/** Explicit result shape so the public API type never leaks Prisma's runtime types. */
export interface DispositionResult {
  id: string;
  status: string;
  disposition: string | null;
  costBreakdown: unknown;
}

export class OutboundService {
  // Per-tenant safety caps until plan-driven quotas wire in (Day 15/56/58).
  private readonly maxConcurrency = 10;
  private readonly maxPerMinute = 30;

  constructor(
    private readonly db: PrismaService,
    private readonly dialer: Dialer,
  ) {}

  /**
   * Place an outbound call: enforce DNC + consent + concurrency + rate gates, persist a
   * QUEUED Call row, then hand the vetted call to the dialer (voice service). All reads
   * + the write run under RLS (`withTenant`) so nothing crosses tenants.
   */
  async placeCall(tenantId: string, input: unknown) {
    const parsed = outboundSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid outbound request');
    }
    const { agentId, to, contactId, flowVersionId, consentBasis, from } = parsed.data;

    const call = await this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId }, select: { id: true } });
      if (!agent) throw new NotFoundError('Agent not found');

      // ── DNC gate: explicit contact flag + phone-based suppression ──────────────
      if (contactId) {
        const contact = await tx.contact.findFirst({
          where: { id: contactId },
          select: { dnc: true },
        });
        if (!contact) throw new NotFoundError('Contact not found');
        if (contact.dnc) throw new ForbiddenError('Destination is on the do-not-call list');
      }
      const dncHit = await tx.contact.findFirst({
        where: { phone: to, dnc: true },
        select: { id: true },
      });
      if (dncHit) throw new ForbiddenError('Destination is on the do-not-call list');

      // ── Concurrency cap: in-flight outbound calls for this tenant ──────────────
      const active = await tx.call.count({
        where: { direction: CallDirection.OUTBOUND, status: { in: ACTIVE_STATUSES } },
      });
      if (active >= this.maxConcurrency) {
        throw new RateLimitError('Outbound concurrency limit reached; try again shortly');
      }

      // ── Rate cap: outbound calls started in the last minute ────────────────────
      const since = new Date(Date.now() - 60_000);
      const recent = await tx.call.count({
        where: { direction: CallDirection.OUTBOUND, createdAt: { gte: since } },
      });
      if (recent >= this.maxPerMinute) {
        throw new RateLimitError('Outbound rate limit reached; slow down');
      }

      return tx.call.create({
        data: {
          tenantId,
          agentId,
          direction: CallDirection.OUTBOUND,
          channel: CallChannel.PSTN,
          status: CallStatus.QUEUED,
          ...(contactId ? { contactId } : {}),
          ...(flowVersionId ? { flowVersionId } : {}),
        },
        select: { id: true, status: true },
      });
    });

    await this.dialer.dial({
      tenantId,
      callId: call.id,
      agentId,
      to,
      ...(from ? { from } : {}),
      ...(flowVersionId ? { flowVersionId } : {}),
    });

    return { callId: call.id, status: call.status, consentBasis };
  }

  /**
   * Record the outcome of a call (disposition + final status + cost breakdown). Called
   * by the voice service when a call ends; tenant-scoped so a call can only be closed
   * within its own tenant.
   */
  async recordDisposition(
    tenantId: string,
    callId: string,
    input: unknown,
  ): Promise<DispositionResult> {
    const parsed = dispositionSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid disposition');
    }
    const { disposition, status, durationSec, recordingUrl, costBreakdown } = parsed.data;
    if (!TERMINAL_CALL_STATUSES.includes(status)) {
      throw new ValidationError('Disposition status must be terminal');
    }

    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.call.findFirst({ where: { id: callId }, select: { id: true } });
      if (!existing) throw new NotFoundError('Call not found');
      return tx.call.update({
        where: { id: callId },
        data: {
          disposition,
          status,
          endedAt: new Date(),
          ...(durationSec != null ? { durationSec } : {}),
          ...(recordingUrl ? { recordingUrl } : {}),
          ...(costBreakdown ? { costBreakdown } : {}),
        },
        select: { id: true, status: true, disposition: true, costBreakdown: true },
      });
    });
  }
}
