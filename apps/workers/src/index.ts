import { parseEnv } from '@vocaliq/shared';

/**
 * @vocaliq/workers — BullMQ/Celery async jobs (campaigns, transcription, scoring,
 * embeddings, webhook delivery, billing reconciliation, notifications).
 * Jobs are idempotent + tenant-namespaced (CODE-PATTERNS §10). Day 0 is a boot stub;
 * real queues land alongside the features that enqueue them.
 */
async function main(): Promise<void> {
  const env = parseEnv();
  console.log(`[workers] booted (env=${env.NODE_ENV}). No queues registered yet (Day 0 stub).`);
  if (!env.REDIS_URL) {
    console.log('[workers] REDIS_URL not set — queue connections will be wired in later days.');
  }
}

void main();
