import { createPrismaClient } from '@vocaliq/db';
import { parseEnv } from '@vocaliq/shared';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createDbFindUnmetered, runReconciliation } from './reconciliation';

/**
 * @vocaliq/workers — BullMQ async jobs (campaigns, transcription, scoring, embeddings,
 * webhook delivery, billing reconciliation, notifications). Jobs are idempotent +
 * tenant-namespaced (CODE-PATTERNS §10). Real queues land alongside the features that
 * enqueue them; Day 13 registers the daily cost-reconciliation sweep.
 */

const RECONCILE_QUEUE = 'cost-reconciliation';

/** Register the daily cost-reconciliation sweep (repeatable job + worker). */
function registerReconciliation(
  redisUrl: string,
  databaseUrl: string | undefined,
): () => Promise<void> {
  // Workers need maxRetriesPerRequest: null (BullMQ blocking commands).
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const admin = createPrismaClient(databaseUrl);
  const findUnmetered = createDbFindUnmetered(admin);

  const queue = new Queue(RECONCILE_QUEUE, { connection });
  // One idempotent repeatable job (stable id) — runs every 24h.
  void queue.add(
    'daily',
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'cost-reconciliation:daily' },
  );

  const worker = new Worker(
    RECONCILE_QUEUE,
    async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 25 * 60 * 60 * 1000); // 25h look-back (overlap)
      const unmetered = await runReconciliation(
        {
          findUnmetered,
          alarm: (summary, calls) => console.error(`[reconcile] ${summary}`, calls.slice(0, 50)),
          log: (msg) => console.log(`[reconcile] ${msg}`),
        },
        { from, to },
      );
      return { unmetered: unmetered.length };
    },
    { connection },
  );
  worker.on('failed', (job, err) => console.error(`[reconcile] job ${job?.id} failed:`, err));

  console.log('[workers] cost-reconciliation queue + worker registered (daily).');
  return async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await admin.$disconnect();
  };
}

async function main(): Promise<void> {
  const env = parseEnv();
  console.log(`[workers] booted (env=${env.NODE_ENV}).`);
  if (!env.REDIS_URL) {
    console.log('[workers] REDIS_URL not set — no queues registered.');
    return;
  }
  registerReconciliation(env.REDIS_URL, env.DATABASE_URL);
}

void main();
