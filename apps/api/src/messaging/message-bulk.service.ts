import { type MessageBulkCampaignInput, messageBulkCampaignSchema } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Durable bulk send (GME-DQ-b) — persists a bulk campaign as a `MessageBulkJob` + one PENDING
 * `MessageBulkRecipient` row per (de-duplicated) recipient. The bulk-send worker (GME-DQ-c) drains the
 * PENDING rows through the internal send endpoint (so every send still passes the `MessagingGuard`),
 * lifting the synchronous 500-recipient cap. This service only writes the work rows + reads progress —
 * it never sends (that's the worker's job), keeping the enqueue fast + tenant-scoped (RLS).
 */

export interface BulkEnqueueResult {
  jobId: string;
  total: number;
}

export interface BulkJobStatus {
  jobId: string;
  status: string;
  total: number;
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
}

export class MessageBulkService {
  constructor(private readonly db: PrismaService) {}

  /** Persist a bulk job + its PENDING recipient rows (de-duped). Returns the job id + recipient count. */
  async enqueue(tenantId: string, input: unknown): Promise<BulkEnqueueResult> {
    const parsed: MessageBulkCampaignInput = messageBulkCampaignSchema.parse(input);
    const unique = [...new Set(parsed.recipients)];

    return this.db.withTenant(tenantId, async (tx) => {
      const job = await tx.messageBulkJob.create({
        data: {
          tenantId,
          channel: parsed.channel,
          ...(parsed.templateId ? { templateId: parsed.templateId } : {}),
          ...(parsed.body ? { body: parsed.body } : {}),
          variables: (parsed.variables ?? {}) as object,
          requireConsent: parsed.requireConsent,
          respectQuietHours: parsed.respectQuietHours,
          total: unique.length,
        },
        select: { id: true },
      });
      await tx.messageBulkRecipient.createMany({
        data: unique.map((to) => ({ tenantId, jobId: job.id, toAddr: to })),
      });
      return { jobId: job.id, total: unique.length };
    });
  }

  /** Progress of a bulk job — the recipient status counts (drives the dashboard + a "done" check). */
  async status(tenantId: string, jobId: string): Promise<BulkJobStatus | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const job = await tx.messageBulkJob.findFirst({
        where: { id: jobId },
        select: { id: true, status: true, total: true },
      });
      if (!job) return null;
      const grouped = await tx.messageBulkRecipient.groupBy({
        by: ['status'],
        where: { jobId },
        _count: { _all: true },
      });
      const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
      return {
        jobId: job.id,
        status: job.status,
        total: job.total,
        pending: count('PENDING'),
        sent: count('SENT'),
        skipped: count('SKIPPED'),
        failed: count('FAILED'),
      };
    });
  }
}
