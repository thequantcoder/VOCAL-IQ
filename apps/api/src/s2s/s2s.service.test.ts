import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { S2SService } from './s2s.service';

/**
 * Speech-to-speech resolution (Day 65) against real Postgres. Proves a simple flow gets S2S (lower
 * latency, self-audit F) while a flow with tools/transfer falls back to the pipeline, all RLS-
 * scoped (self-audit B). The provider is injected as available so we exercise the S2S path.
 */

const db = new PrismaService();
const svcOn = new S2SService(db, true); // provider available
const svcOff = new S2SService(db, false); // gated → always pipeline

const C1 = '00000000-0000-0000-0000-000000000003';
const SIMPLE_AGENT = '00000000-0000-0000-0000-0000065a0001';
const COMPLEX_AGENT = '00000000-0000-0000-0000-0000065a0002';

async function seedAgentWithFlow(agentId: string, nodes: { type: string }[]) {
  await db.admin.agent.upsert({
    where: { id: agentId },
    create: { id: agentId, tenantId: C1, name: 'S2S Agent', languages: ['en'] },
    update: { languages: ['en'] },
  });
  const flow = await db.admin.flow.create({
    data: { tenantId: C1, agentId, name: 'f', isActive: true },
    select: { id: true },
  });
  await db.admin.flowVersion.create({
    data: { tenantId: C1, flowId: flow.id, version: 1, graph: { nodes } },
  });
}

beforeAll(async () => {
  await seedAgentWithFlow(SIMPLE_AGENT, [
    { type: 'START' },
    { type: 'SAY' },
    { type: 'LISTEN' },
    { type: 'END' },
  ]);
  await seedAgentWithFlow(COMPLEX_AGENT, [
    { type: 'START' },
    { type: 'TOOL' },
    { type: 'TRANSFER' },
    { type: 'END' },
  ]);
});

afterAll(async () => {
  await db.admin.flowVersion.deleteMany({
    where: { tenantId: C1, flow: { agentId: { in: [SIMPLE_AGENT, COMPLEX_AGENT] } } },
  });
  await db.admin.flow.deleteMany({ where: { agentId: { in: [SIMPLE_AGENT, COMPLEX_AGENT] } } });
  await db.admin.agent.deleteMany({ where: { id: { in: [SIMPLE_AGENT, COMPLEX_AGENT] } } });
});

describe('S2SService.resolveMode', () => {
  it('uses S2S for a simple flow when the provider is available', async () => {
    const d = await svcOn.resolveMode(C1, SIMPLE_AGENT);
    expect(d.mode).toBe('s2s');
    expect(d.estimatedSavingMs).toBeGreaterThan(0);
  });

  it('falls back to the pipeline for a flow with tools + transfer', async () => {
    const d = await svcOn.resolveMode(C1, COMPLEX_AGENT);
    expect(d.mode).toBe('pipeline');
    expect(d.eligible).toBe(false);
  });

  it('always uses the pipeline when no S2S provider is configured (gated)', async () => {
    const d = await svcOff.resolveMode(C1, SIMPLE_AGENT);
    expect(d.mode).toBe('pipeline');
    expect(d.reason).toContain('no S2S provider');
  });

  it('404s an unknown agent', async () => {
    await expect(svcOn.resolveMode(C1, '00000000-0000-0000-0000-0000ffffffff')).rejects.toThrow();
  });
});
