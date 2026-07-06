import { createPrismaClient } from '@vocaliq/db';
import { parseEnv } from '@vocaliq/shared';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createDbCallbackDialerDeps, runCallbackDialerTick } from './callback-dialer';
import { createDbSchedulerDeps, runCampaignTick } from './campaign-scheduler';
import { createDbConvoIntelDeps, runConversationIntel } from './conversation-intel';
import { createDbMemoryDeps, runMemoryExtraction } from './memory-extraction';
import { createDbPostCallDeps, runPostCallIntel } from './post-call-intel';
import { createDbQaDeps, runQaScoring } from './qa-scoring';
import { createDbFindUnmetered, runReconciliation } from './reconciliation';

/**
 * @vocaliq/workers — BullMQ async jobs (campaigns, transcription, scoring, embeddings,
 * webhook delivery, billing reconciliation, notifications). Jobs are idempotent +
 * tenant-namespaced (CODE-PATTERNS §10). Real queues land alongside the features that
 * enqueue them; Day 13 registers the daily cost-reconciliation sweep.
 */

const RECONCILE_QUEUE = 'cost-reconciliation';
const CAMPAIGN_QUEUE = 'campaign-scheduler';
const CALLBACK_QUEUE = 'callback-dialer';
const POST_CALL_QUEUE = 'post-call-intel';

/**
 * Post-call intelligence worker (Day 31). Consumes `{ transcriptId }` jobs (the live call
 * loop enqueues one on call-end — that wiring rides with the Day-9 loop bundle) and runs a
 * metered LLM summary/keyword extraction onto the transcript. Exported so the loop can
 * enqueue via the same queue name.
 */
function registerPostCallIntel(
  redisUrl: string,
  databaseUrl: string | undefined,
): () => Promise<void> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const admin = createPrismaClient(databaseUrl);
  const deps = createDbPostCallDeps(admin, (msg) => console.log(`[post-call] ${msg}`));

  const worker = new Worker<{ transcriptId: string }>(
    POST_CALL_QUEUE,
    async (job) => runPostCallIntel(deps, job.data.transcriptId),
    { connection },
  );
  worker.on('failed', (job, err) => console.error(`[post-call] job ${job?.id} failed:`, err));

  console.log('[workers] post-call-intel queue + worker registered.');
  return async () => {
    await worker.close();
    await connection.quit();
    await admin.$disconnect();
  };
}

const CONVO_INTEL_QUEUE = 'conversation-intel';

/**
 * Conversation-intelligence worker (Day 75). Consumes `{ callId }` jobs (the post-call bundle
 * enqueues one on call-end alongside intel + QA) and mines the transcript for business signals
 * deterministically — no LLM call, so it adds zero per-call spend. Signals feed the trend
 * dashboards + alerts. Idempotent (re-running replaces the call's signals).
 */
function registerConversationIntel(
  redisUrl: string,
  databaseUrl: string | undefined,
): () => Promise<void> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const admin = createPrismaClient(databaseUrl);
  const deps = createDbConvoIntelDeps(admin, (msg) => console.log(`[convo-intel] ${msg}`));

  const worker = new Worker<{ callId: string }>(
    CONVO_INTEL_QUEUE,
    async (job) => runConversationIntel(deps, job.data.callId),
    { connection },
  );
  worker.on('failed', (job, err) => console.error(`[convo-intel] job ${job?.id} failed:`, err));

  console.log('[workers] conversation-intel queue + worker registered.');
  return async () => {
    await worker.close();
    await connection.quit();
    await admin.$disconnect();
  };
}

const MEMORY_QUEUE = 'memory-extraction';
const QA_QUEUE = 'qa-scoring';

/**
 * Automated QA scoring worker (Day 43). Consumes `{ callId }` jobs (the post-call bundle
 * enqueues one on call-end alongside intel) and scores the transcript against the tenant's
 * active rubrics via a metered LLM call, persisting a QaScore per rubric. Cost-aware
 * sampling lives in the pure `runQaScoring`.
 */
function registerQaScoring(redisUrl: string, databaseUrl: string | undefined): () => Promise<void> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const admin = createPrismaClient(databaseUrl);
  const deps = createDbQaDeps(admin, (msg) => console.log(`[qa] ${msg}`));

  const worker = new Worker<{ callId: string }>(
    QA_QUEUE,
    async (job) => runQaScoring(deps, job.data.callId),
    { connection },
  );
  worker.on('failed', (job, err) => console.error(`[qa] job ${job?.id} failed:`, err));

  console.log('[workers] qa-scoring queue + worker registered.');
  return async () => {
    await worker.close();
    await connection.quit();
    await admin.$disconnect();
  };
}

/**
 * Cross-call memory extraction worker (Day 34). Consumes `{ tenantId, agentId, contactId,
 * transcriptId }` jobs (the live loop enqueues on call-end when the agent has memory on —
 * that wiring rides with the Day-9 loop bundle) and merges distilled facts into AgentMemory.
 */
function registerMemoryExtraction(
  redisUrl: string,
  databaseUrl: string | undefined,
): () => Promise<void> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const admin = createPrismaClient(databaseUrl);
  const deps = createDbMemoryDeps(admin, (msg) => console.log(`[memory] ${msg}`));

  const worker = new Worker(MEMORY_QUEUE, async (job) => runMemoryExtraction(deps, job.data), {
    connection,
  });
  worker.on('failed', (job, err) => console.error(`[memory] job ${job?.id} failed:`, err));

  console.log('[workers] memory-extraction queue + worker registered.');
  return async () => {
    await worker.close();
    await connection.quit();
    await admin.$disconnect();
  };
}

/** Register the campaign scheduler tick (repeatable job + worker) — every 15s. */
function registerCampaignScheduler(
  redisUrl: string,
  databaseUrl: string | undefined,
): () => Promise<void> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const admin = createPrismaClient(databaseUrl);
  const deps = createDbSchedulerDeps(admin, (msg) => console.log(`[campaigns] ${msg}`));

  const queue = new Queue(CAMPAIGN_QUEUE, { connection });
  void queue.add('tick', {}, { repeat: { every: 15_000 }, jobId: 'campaign-scheduler:tick' });

  const worker = new Worker(
    CAMPAIGN_QUEUE,
    async () => {
      const res = await runCampaignTick(deps, new Date());
      return res;
    },
    { connection },
  );
  worker.on('failed', (job, err) => console.error(`[campaigns] job ${job?.id} failed:`, err));

  console.log('[workers] campaign-scheduler queue + worker registered (15s tick).');
  return async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await admin.$disconnect();
  };
}

/** Register the callback dialer tick (repeatable job + worker) — every 15s. */
function registerCallbackDialer(
  redisUrl: string,
  databaseUrl: string | undefined,
): () => Promise<void> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const admin = createPrismaClient(databaseUrl);
  const deps = createDbCallbackDialerDeps(admin, (msg) => console.log(`[callbacks] ${msg}`));

  const queue = new Queue(CALLBACK_QUEUE, { connection });
  void queue.add('tick', {}, { repeat: { every: 15_000 }, jobId: 'callback-dialer:tick' });

  const worker = new Worker(CALLBACK_QUEUE, async () => runCallbackDialerTick(deps, new Date()), {
    connection,
  });
  worker.on('failed', (job, err) => console.error(`[callbacks] job ${job?.id} failed:`, err));

  console.log('[workers] callback-dialer queue + worker registered (15s tick).');
  return async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await admin.$disconnect();
  };
}

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
  registerCampaignScheduler(env.REDIS_URL, env.DATABASE_URL);
  registerCallbackDialer(env.REDIS_URL, env.DATABASE_URL);
  registerPostCallIntel(env.REDIS_URL, env.DATABASE_URL);
  registerConversationIntel(env.REDIS_URL, env.DATABASE_URL);
  registerMemoryExtraction(env.REDIS_URL, env.DATABASE_URL);
  registerQaScoring(env.REDIS_URL, env.DATABASE_URL);
}

void main();
