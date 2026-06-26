import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { RouterService } from './router.service';

/**
 * Live, end-to-end proof of the metered LLM path: a real completion through the
 * router that PERSISTS a tenant-scoped UsageRecord (golden rule #4). Skips without
 * a provider key (CI), so it never blocks the gate. Requires the seeded DB.
 */
const hasKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
const live = hasKey ? describe : describe.skip;

// Seeded demo customer tenant (prisma db seed).
const CUSTOMER = '00000000-0000-0000-0000-000000000003';

const db = new PrismaService();
const svc = new RouterService(db);

afterAll(() => db.onModuleDestroy());

live('RouterService.complete (live)', () => {
  it('returns a completion and persists a UsageRecord with positive cost', async () => {
    const before = await db.admin.usageRecord.count({ where: { tenantId: CUSTOMER } });

    const result = await svc.complete({
      tenantId: CUSTOMER,
      messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
      system: 'You are a terse test assistant.',
      maxTokens: 16,
    });
    expect(result.text.toLowerCase()).toContain('pong');

    const records = await db.admin.usageRecord.findMany({
      where: { tenantId: CUSTOMER },
      orderBy: { ts: 'desc' },
      take: 1,
    });
    expect(await db.admin.usageRecord.count({ where: { tenantId: CUSTOMER } })).toBe(before + 1);
    expect(records[0]?.capability).toBe('llm');
    expect(records[0]?.units).toBeGreaterThan(0);
    expect(Number(records[0]?.costUsd)).toBeGreaterThan(0);
    expect(records[0]?.byok).toBe(false);
  });
});
