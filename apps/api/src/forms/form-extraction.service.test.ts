import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { FormExtractionService } from './form-extraction.service';

/**
 * Post-call form extraction (PARITY-03 voice leg) against real Postgres + RLS. Proves: a call whose
 * agent flow has a FORM node gets its transcript extracted (fake LLM) + submitted; a flow with no
 * FORM node never spends LLM; a missing transcript skips; a submit failure is swallowed.
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT = '00000000-0000-0000-0000-0000fe010001';
const AGENT_PLAIN = '00000000-0000-0000-0000-0000fe010002';
const FORM = '00000000-0000-0000-0000-0000fe010003';
const CALL = '00000000-0000-0000-0000-0000fe010004';
const CALL_PLAIN = '00000000-0000-0000-0000-0000fe010005';
const CALL_NO_TRANSCRIPT = '00000000-0000-0000-0000-0000fe010006';
const FLOW = '00000000-0000-0000-0000-0000fe010007';

beforeAll(async () => {
  const a = db.admin;
  await a.form.upsert({
    where: { id: FORM },
    create: {
      id: FORM,
      tenantId: C1,
      name: 'Signup',
      active: true,
      fields: [
        { key: 'full_name', label: 'Full name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
      ],
      routing: {},
    },
    update: { active: true },
  });
  await a.agent.createMany({
    data: [
      { id: AGENT, tenantId: C1, name: 'Form Voice Agent' },
      { id: AGENT_PLAIN, tenantId: C1, name: 'Plain Voice Agent' }, // no flow at all
    ],
    skipDuplicates: true,
  });
  await a.flow.upsert({
    where: { id: FLOW },
    create: { id: FLOW, tenantId: C1, agentId: AGENT, name: 'form', isActive: true },
    update: {},
  });
  await a.flowVersion.create({
    data: {
      tenantId: C1,
      flowId: FLOW,
      version: 1,
      publishedAt: new Date(),
      graph: {
        nodes: [
          { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { config: {} } },
          {
            id: 'form',
            type: 'FORM',
            position: { x: 0, y: 1 },
            data: { config: { formId: FORM } },
          },
          { id: 'end', type: 'END', position: { x: 0, y: 2 }, data: { config: {} } },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'form' },
          { id: 'e2', source: 'form', target: 'end' },
        ],
      },
    },
  });
  await a.call.createMany({
    data: [
      {
        id: CALL,
        tenantId: C1,
        agentId: AGENT,
        direction: 'INBOUND',
        channel: 'WEB',
        status: 'COMPLETED',
      },
      {
        id: CALL_NO_TRANSCRIPT,
        tenantId: C1,
        agentId: AGENT,
        direction: 'INBOUND',
        channel: 'WEB',
        status: 'COMPLETED',
      },
      {
        id: CALL_PLAIN,
        tenantId: C1,
        agentId: AGENT_PLAIN,
        direction: 'INBOUND',
        channel: 'WEB',
        status: 'COMPLETED',
      },
    ],
    skipDuplicates: true,
  });
  await a.transcript.upsert({
    where: { callId: CALL },
    create: {
      callId: CALL,
      tenantId: C1,
      segments: [
        { role: 'agent', text: 'May I take your details?' },
        { role: 'user', text: 'Sure — Ada Lovelace, email ada@x.com' },
      ],
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.transcript.deleteMany({ where: { callId: CALL } });
  await db.admin.call.deleteMany({ where: { id: { in: [CALL, CALL_PLAIN, CALL_NO_TRANSCRIPT] } } });
  await db.admin.flow.deleteMany({ where: { id: FLOW } });
  await db.admin.form.deleteMany({ where: { id: FORM } });
  await db.admin.agent.deleteMany({ where: { id: { in: [AGENT, AGENT_PLAIN] } } });
});

describe('FormExtractionService.extractForCall', () => {
  it('extracts the form values from the transcript and submits them', async () => {
    const prompts: string[] = [];
    const submits: { formId: string; values: Record<string, string> }[] = [];
    const svc = new FormExtractionService(
      db,
      async ({ user }) => {
        prompts.push(user);
        return '{"full_name":"Ada Lovelace","email":"ada@x.com"}';
      },
      async (_tid, formId, values) => {
        submits.push({ formId, values });
      },
    );
    const res = await svc.extractForCall(C1, CALL);
    expect(res).toEqual({ status: 'ok', submitted: 1 });
    expect(prompts[0]).toContain('- full_name: Full name'); // fields in the prompt
    expect(prompts[0]).toContain('Ada Lovelace, email ada@x.com'); // transcript in the prompt
    expect(submits).toEqual([
      { formId: FORM, values: { full_name: 'Ada Lovelace', email: 'ada@x.com' } },
    ]);
  });

  it('spends no LLM when the agent flow has no FORM node', async () => {
    const svc = new FormExtractionService(
      db,
      async () => {
        throw new Error('LLM must not be called');
      },
      async () => {
        throw new Error('submit must not be called');
      },
    );
    await expect(svc.extractForCall(C1, CALL_PLAIN)).resolves.toEqual({
      status: 'no_forms',
      submitted: 0,
    });
  });

  it('skips (no LLM) when the call has no transcript', async () => {
    const svc = new FormExtractionService(
      db,
      async () => {
        throw new Error('LLM must not be called');
      },
      async () => {
        throw new Error('submit must not be called');
      },
    );
    await expect(svc.extractForCall(C1, CALL_NO_TRANSCRIPT)).resolves.toEqual({
      status: 'skipped',
      submitted: 0,
    });
  });

  it('swallows a submit failure (best-effort — never breaks call teardown)', async () => {
    const svc = new FormExtractionService(
      db,
      async () => '{"full_name":"Ada"}',
      async () => {
        throw new Error('db down');
      },
    );
    await expect(svc.extractForCall(C1, CALL)).resolves.toEqual({ status: 'ok', submitted: 0 });
  });
});
