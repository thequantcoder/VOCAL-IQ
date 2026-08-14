import type { PrismaClient } from '@vocaliq/db';

/**
 * Durable bulk-send tick (GME-DQ-c). Drains PENDING `MessageBulkRecipient` rows for each RUNNING
 * `MessageBulkJob` and delivers each through the api's internal guarded-send endpoint (DQ-a) — so every
 * bulk send still passes the `MessagingGuard` (consent/opt-out/DNC/quiet-hours) + is metered. This is
 * what lifts the synchronous 500-recipient cap: the api enqueue (DQ-b) is instant, this worker sends
 * over time within a per-tick batch cap. Pure runner + injected deps → tested without Redis/HTTP/PG.
 *
 * Outcome mapping (per recipient):
 *   SENT     → row SENT (done)
 *   SKIPPED  → row SKIPPED + reason (a guard refusal / gated provider — PERMANENT, never retried)
 *   RETRY    → a transient failure: stay PENDING (retried next tick) until `maxAttempts`, then FAILED
 * A job with no PENDING rows left is marked DONE.
 */

export type SendOutcomeStatus = 'SENT' | 'SKIPPED' | 'RETRY';

export interface BulkJobSpec {
  id: string;
  tenantId: string;
  channel: string;
  templateId: string | null;
  body: string | null;
  variables: unknown;
  requireConsent: boolean;
  respectQuietHours: boolean;
}

export interface BulkRecipientRow {
  id: string;
  toAddr: string;
  attempts: number;
}

export interface BulkSendDeps {
  findRunningJobs(): Promise<BulkJobSpec[]>;
  findPendingRecipients(jobId: string, limit: number): Promise<BulkRecipientRow[]>;
  /** Deliver one recipient via the internal guarded-send endpoint. */
  send(job: BulkJobSpec, to: string): Promise<{ status: SendOutcomeStatus; reason?: string }>;
  markRecipient(id: string, status: string, attempts: number, reason?: string): Promise<void>;
  markJobDone(jobId: string): Promise<void>;
  log(message: string): void;
}

export interface BulkTickOptions {
  /** Max recipients to attempt per job per tick (pace cap). */
  batchPerJob?: number;
  /** Max attempts before a transient failure becomes terminal FAILED. */
  maxAttempts?: number;
}

export interface BulkTickResult {
  jobsConsidered: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

export async function runBulkSendTick(
  deps: BulkSendDeps,
  opts: BulkTickOptions = {},
): Promise<BulkTickResult> {
  const batchPerJob = opts.batchPerJob ?? 100;
  const maxAttempts = opts.maxAttempts ?? 3;
  const result: BulkTickResult = { jobsConsidered: 0, sent: 0, skipped: 0, failed: 0, retried: 0 };

  const jobs = await deps.findRunningJobs();
  result.jobsConsidered = jobs.length;

  for (const job of jobs) {
    try {
      const recipients = await deps.findPendingRecipients(job.id, batchPerJob);
      if (recipients.length === 0) {
        await deps.markJobDone(job.id);
        continue;
      }
      for (const r of recipients) {
        const attempts = r.attempts + 1;
        const outcome = await deps.send(job, r.toAddr);
        if (outcome.status === 'SENT') {
          await deps.markRecipient(r.id, 'SENT', attempts);
          result.sent++;
        } else if (outcome.status === 'SKIPPED') {
          await deps.markRecipient(r.id, 'SKIPPED', attempts, outcome.reason); // permanent
          result.skipped++;
        } else if (attempts >= maxAttempts) {
          await deps.markRecipient(r.id, 'FAILED', attempts, outcome.reason); // give up
          result.failed++;
        } else {
          await deps.markRecipient(r.id, 'PENDING', attempts, outcome.reason); // retry next tick
          result.retried++;
        }
      }
      deps.log(
        `[bulk ${job.id}] processed ${recipients.length} (sent=${result.sent} skipped=${result.skipped})`,
      );
    } catch (err) {
      // Isolate one job's failure so the rest of the tick still runs.
      deps.log(`[bulk ${job.id}] tick error: ${(err as Error).message}`);
    }
  }
  return result;
}

/**
 * The internal guarded-send call (DQ-a). POSTs one recipient to the api and maps the response to a
 * send outcome: a 2xx `SENT` → SENT; a `SKIPPED`/`QUEUED` (guard refusal / gated provider) → SKIPPED
 * (permanent); any non-2xx / network error → RETRY (transient).
 */
export function createInternalSend(
  apiInternalUrl: string,
  secret: string,
  fetchFn: typeof fetch = fetch,
): BulkSendDeps['send'] {
  return async (job, to) => {
    try {
      const res = await fetchFn(`${apiInternalUrl.replace(/\/$/, '')}/internal/messaging/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({
          tenantId: job.tenantId,
          channel: job.channel,
          to,
          campaignId: job.id,
          requireConsent: job.requireConsent,
          respectQuietHours: job.respectQuietHours,
          ...(job.templateId ? { templateId: job.templateId } : {}),
          ...(job.body ? { body: job.body } : {}),
          ...(job.variables && typeof job.variables === 'object'
            ? { variables: job.variables as Record<string, string> }
            : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { status: 'RETRY', reason: `internal send ${res.status}` };
      const data = (await res.json()) as { status?: string; reason?: string };
      if (data.status === 'SENT') return { status: 'SENT' };
      // SKIPPED (guard refusal) or QUEUED (no provider configured) → permanent, don't retry.
      return { status: 'SKIPPED', ...(data.reason ? { reason: data.reason } : {}) };
    } catch (err) {
      return { status: 'RETRY', reason: (err as Error).message };
    }
  };
}

/** Prisma-backed deps for the bulk-send tick (workers legitimately span tenants via the admin client). */
export function createDbBulkSendDeps(
  admin: PrismaClient,
  send: BulkSendDeps['send'],
  log: (msg: string) => void,
): BulkSendDeps {
  return {
    findRunningJobs: async () => {
      const rows = await admin.messageBulkJob.findMany({
        where: { status: 'RUNNING' },
        select: {
          id: true,
          tenantId: true,
          channel: true,
          templateId: true,
          body: true,
          variables: true,
          requireConsent: true,
          respectQuietHours: true,
        },
      });
      return rows.map((r) => ({ ...r, variables: r.variables }));
    },
    findPendingRecipients: async (jobId, limit) => {
      const rows = await admin.messageBulkRecipient.findMany({
        where: { jobId, status: 'PENDING' },
        select: { id: true, toAddr: true, attempts: true },
        take: limit,
      });
      return rows;
    },
    send,
    markRecipient: async (id, status, attempts, reason) => {
      await admin.messageBulkRecipient.update({
        where: { id },
        data: { status, attempts, ...(reason ? { reason } : {}) },
      });
    },
    markJobDone: async (jobId) => {
      await admin.messageBulkJob.update({ where: { id: jobId }, data: { status: 'DONE' } });
    },
    log,
  };
}
