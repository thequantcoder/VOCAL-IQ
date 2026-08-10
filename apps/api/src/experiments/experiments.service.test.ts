import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ExperimentsService } from './experiments.service';

/**
 * A/B experiments (Day 30), against real Postgres (RLS-scoped). Proves: create validates
 * variants, RUNNING experiments assign a stable variant, results aggregate per variant with
 * significance, and experiments are tenant-isolated.
 */

const db = new PrismaService();
const svc = new ExperimentsService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const createdExperiments: string[] = [];
const createdAgents: string[] = [];
const createdCalls: string[] = [];

afterAll(async () => {
  await db.admin.call.deleteMany({ where: { id: { in: createdCalls } } });
  await db.admin.experiment.deleteMany({ where: { id: { in: createdExperiments } } });
  await db.admin.agent.deleteMany({ where: { id: { in: createdAgents } } });
});

const VARIANTS = [
  { id: 'a', label: 'Control', weight: 1, config: { opener: 'Hi' } },
  { id: 'b', label: 'Variant B', weight: 1, config: { opener: 'Hey there' } },
];

describe('ExperimentsService', () => {
  it('creates, runs, assigns a stable variant, and reports results with significance', async () => {
    const exp = await svc.create(C1, {
      name: 'Opener test',
      metric: 'booking',
      variants: VARIANTS,
    });
    createdExperiments.push(exp.id);
    expect(exp.status).toBe('DRAFT');
    expect(exp.variants).toHaveLength(2);

    // DRAFT does not assign.
    expect(await svc.assign(C1, exp.id, 'contact-1')).toBeNull();

    await svc.setStatus(C1, exp.id, 'RUNNING');
    const first = await svc.assign(C1, exp.id, 'contact-1');
    expect(first?.variant).toMatch(/^[ab]$/);
    // Stable for the same key.
    const again = await svc.assign(C1, exp.id, 'contact-1');
    expect(again?.variant).toBe(first?.variant);

    // Seed calls: variant a mostly non-booked, variant b mostly booked.
    const agent = await db.admin.agent.create({
      data: { tenantId: C1, name: 'Exp Agent' },
      select: { id: true },
    });
    createdAgents.push(agent.id);
    const mk = async (variant: string, disposition: string) => {
      const call = await db.admin.call.create({
        data: {
          tenantId: C1,
          agentId: agent.id,
          direction: 'INBOUND',
          channel: 'PSTN',
          status: 'COMPLETED',
          disposition,
          experimentId: exp.id,
          variant,
        },
        select: { id: true },
      });
      createdCalls.push(call.id);
    };
    for (let i = 0; i < 100; i++) await mk('a', i < 10 ? 'BOOKED' : 'NO_ANSWER'); // 10%
    for (let i = 0; i < 100; i++) await mk('b', i < 40 ? 'BOOKED' : 'NO_ANSWER'); // 40%

    const results = await svc.results(C1, exp.id);
    expect(results.totalCalls).toBe(200);
    const a = results.rows.find((r) => r.variant === 'a');
    const b = results.rows.find((r) => r.variant === 'b');
    expect(a?.isControl).toBe(true);
    expect(a?.rate).toBeCloseTo(0.1, 2);
    expect(b?.rate).toBeCloseTo(0.4, 2);
    expect(b?.significant).toBe(true); // 10% vs 40% on n=100 each
  });

  it('rejects an experiment with <2 variants', async () => {
    await expect(
      svc.create(C1, { name: 'Bad', metric: 'conversion', variants: [VARIANTS[0]] }),
    ).rejects.toSatisfy(isAppError);
  });

  it('isolates experiments by tenant (RLS)', async () => {
    const exp = await svc.create(R1, { name: 'R1 exp', metric: 'conversion', variants: VARIANTS });
    createdExperiments.push(exp.id);
    await expect(svc.get(C1, exp.id)).rejects.toSatisfy(isAppError);
    const c1 = await svc.list(C1);
    expect(c1.some((e) => e.id === exp.id)).toBe(false);
  });
});
