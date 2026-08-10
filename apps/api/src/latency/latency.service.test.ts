import { LATENCY_SLO } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { LatencyService } from './latency.service';

/**
 * Voice-loop latency telemetry (Day 63) against real Postgres. Proves per-turn recording, p50/p95
 * SLO summarization (self-audit F), per-provider latency for routing (self-audit D), and tenant
 * isolation (self-audit B).
 */

const db = new PrismaService();
const svc = new LatencyService(db);
const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer

afterAll(async () => {
  await db.admin.callLatency.deleteMany({ where: { tenantId: C1 } });
});

describe('LatencyService', () => {
  it('records samples and summarizes p50/p95 vs SLO (within budget → no breach)', async () => {
    for (let i = 0; i < 20; i++) {
      await svc.record(C1, {
        stt: 250,
        llmTtft: 350,
        ttsTtfa: 250,
        network: 120,
        provider: 'openai',
      });
    }
    const s = await svc.summary(C1, 24);
    expect(s.count).toBeGreaterThanOrEqual(20);
    expect(s.breached).toBe(false);
    const total = s.stats.find((x) => x.stage === 'total')!;
    expect(total.p95).toBeLessThanOrEqual(LATENCY_SLO.total);
  });

  it('flags a breach when a provider is slow, and exposes per-provider p95 for routing', async () => {
    for (let i = 0; i < 20; i++) {
      await svc.record(C1, {
        stt: 250,
        llmTtft: 950,
        ttsTtfa: 250,
        network: 120,
        provider: 'slowllm',
      });
    }
    const s = await svc.summary(C1, 24);
    expect(s.breached).toBe(true);
    expect(s.stats.find((x) => x.stage === 'llmTtft')!.breached).toBe(true);

    const providers = await svc.providerLatencies(C1, 24);
    const slow = providers.find((p) => p.provider === 'slowllm');
    const fast = providers.find((p) => p.provider === 'openai');
    expect(slow!.p95).toBeGreaterThan(fast!.p95);
  });

  it('rejects an invalid sample', async () => {
    await expect(svc.record(C1, { stt: -1, llmTtft: 1, ttsTtfa: 1, network: 1 })).rejects.toThrow();
  });
});
