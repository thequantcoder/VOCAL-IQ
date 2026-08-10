import { buildSystemPrompt, getAgentTemplate, isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentsService } from '../agents/agents.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { FlowsService } from '../flows/flows.service';
import { TemplatesService } from './templates.service';

/** Template clone (real Postgres, RLS-scoped) — Day 24. */

const db = new PrismaService();
const svc = new TemplatesService(
  new AgentsService(db, new EntitlementsService(db)),
  new FlowsService(db),
);
const C1 = '00000000-0000-0000-0000-000000000003';
const PLAN_SCALE = '00000000-0000-0000-0000-000000000012';
const SUB_ID = '00000000-0000-0000-0000-0000008a0001';
const created: string[] = [];

beforeAll(async () => {
  // Scale sub so the agent-limit gate has headroom in this shared tenant.
  await db.admin.subscription.upsert({
    where: { id: SUB_ID },
    create: { id: SUB_ID, tenantId: C1, planId: PLAN_SCALE, status: 'ACTIVE' },
    update: { status: 'ACTIVE', planId: PLAN_SCALE },
  });
});

afterAll(async () => {
  await db.admin.flowVersion.deleteMany({ where: { flow: { agentId: { in: created } } } });
  await db.admin.flow.deleteMany({ where: { agentId: { in: created } } });
  await db.admin.agent.deleteMany({ where: { id: { in: created } } });
  await db.admin.subscription.deleteMany({ where: { id: SUB_ID } });
});

describe('TemplatesService.clone', () => {
  it('creates an agent with the template persona + installs the starter flow', async () => {
    const res = await svc.clone(C1, 'support-inbound', 'Front Desk');
    created.push(res.agentId);
    expect(res.name).toBe('Front Desk');

    // Persona → the agent's system prompt.
    const agent = await db.admin.agent.findUnique({ where: { id: res.agentId } });
    const tpl = getAgentTemplate('support-inbound');
    expect((agent?.persona as { systemPrompt: string }).systemPrompt).toBe(
      buildSystemPrompt(
        tpl?.persona ?? { role: '', tone: '', instructions: '', guardrails: [], bannedWords: [] },
      ),
    );

    // The starter graph is installed as the draft.
    const draft = await new FlowsService(db).getOrCreateDraft(C1, res.agentId);
    expect((draft.graph as { nodes: unknown[] }).nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('404s an unknown template', async () => {
    await expect(svc.clone(C1, 'nope', undefined)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });
});
