import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { AbuseService } from './abuse.service';

/**
 * Abuse detection (Day 64) against real Postgres. Proves the anti-spam/robocall gate fires on a
 * burst of short outbound calls to few destinations and stays quiet for a clean tenant. RLS-scoped
 * (self-audit B + C).
 */

const db = new PrismaService();
const svc = new AbuseService(db);

const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer
const AGENT = '00000000-0000-0000-0000-0000064a0001';
const madeCallIds: string[] = [];

beforeAll(async () => {
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Abuse Agent' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.call.deleteMany({ where: { id: { in: madeCallIds } } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
});

async function makeCalls(n: number, opts: { short?: boolean; failed?: boolean }) {
  for (let i = 0; i < n; i++) {
    const c = await db.admin.call.create({
      data: {
        tenantId: C1,
        agentId: AGENT,
        direction: 'OUTBOUND',
        channel: 'PSTN',
        status: opts.failed ? 'FAILED' : 'COMPLETED',
        ...(opts.short ? { durationSec: 2 } : { durationSec: 60 }),
      },
      select: { id: true },
    });
    madeCallIds.push(c.id);
  }
}

describe('AbuseService.assess', () => {
  it('is quiet for a clean, low-volume tenant', async () => {
    const v = await svc.assess(C1);
    expect(v.action).toBe('allow');
  });

  it('blocks a robocall burst (many short calls, few destinations, over the hourly cap)', async () => {
    // The seed customer is TRIAL/new + unverified; a burst of short calls should trip the gate.
    await makeCalls(30, { short: true }); // all short, same (null) destination
    await makeCalls(20, { short: true, failed: true }); // + failures → sweeping signal
    const v = await svc.assess(C1);
    expect(['throttle', 'block']).toContain(v.action);
    expect(v.reasons.length).toBeGreaterThan(0);
    expect(v.score).toBeGreaterThan(0);
  });
});
