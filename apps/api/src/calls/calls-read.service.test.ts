import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { CallsReadService } from './calls-read.service';

/** Call list (cursor pagination) + detail with transcript (real Postgres, RLS). */

const db = new PrismaService();
const svc = new CallsReadService(db);

const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT = '00000000-0000-0000-0000-0000003a0001';
const CALL_A = '00000000-0000-0000-0000-0000003a0002';
const CALL_B = '00000000-0000-0000-0000-0000003a0003';
const CALL_WA = '00000000-0000-0000-0000-0000003a0004';

beforeAll(async () => {
  const a = db.admin;
  await a.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Read Agent' },
    update: {},
  });
  const mk = (
    id: string,
    status: 'COMPLETED' | 'NO_ANSWER',
    createdAt: Date,
    channel: 'PSTN' | 'WHATSAPP' = 'PSTN',
    direction: 'INBOUND' | 'OUTBOUND' = 'OUTBOUND',
  ) =>
    a.call.upsert({
      where: { id },
      create: { id, tenantId: C1, agentId: AGENT, direction, channel, status, createdAt },
      update: { status, channel },
    });
  await mk(CALL_A, 'COMPLETED', new Date('2021-03-01T10:00:00Z'));
  await mk(CALL_B, 'NO_ANSWER', new Date('2021-03-01T11:00:00Z')); // newer
  await mk(CALL_WA, 'COMPLETED', new Date('2021-03-01T12:00:00Z'), 'WHATSAPP', 'INBOUND');
  await a.transcript.upsert({
    where: { callId: CALL_A },
    create: {
      callId: CALL_A,
      tenantId: C1,
      segments: [
        { speaker: 'agent', text: 'Hello!', startMs: 0, endMs: 900 },
        { speaker: 'user', text: 'Hi there.', startMs: 1000, endMs: 1800 },
      ],
      summary: 'Greeting exchange.',
      keywords: ['greeting'],
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.transcript.deleteMany({ where: { callId: { in: [CALL_A, CALL_B] } } });
  await db.admin.call.deleteMany({ where: { agentId: AGENT } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
});

describe('CallsReadService.list', () => {
  it('returns calls newest-first with the agent name', async () => {
    const res = await svc.list(C1, { agentId: AGENT });
    const ids = res.items.map((c) => c.id);
    expect(ids.indexOf(CALL_B)).toBeLessThan(ids.indexOf(CALL_A)); // B (newer) first
    expect(res.items[0]?.agent.name).toBe('Read Agent');
  });

  it('paginates by cursor', async () => {
    // Scope to PSTN so the WhatsApp row doesn't shift the exact-order assertions.
    const page1 = await svc.list(C1, { agentId: AGENT, channel: 'PSTN', limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBe(CALL_B);

    const page2 = await svc.list(C1, {
      agentId: AGENT,
      channel: 'PSTN',
      limit: 1,
      cursor: page1.nextCursor,
    });
    expect(page2.items[0]?.id).toBe(CALL_A);
    expect(page2.nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    const res = await svc.list(C1, { agentId: AGENT, status: 'COMPLETED' });
    expect(res.items.map((c) => c.id).sort()).toEqual([CALL_A, CALL_WA].sort());
  });

  it('filters by channel (WhatsApp) — WAC-04', async () => {
    const res = await svc.list(C1, { agentId: AGENT, channel: 'WHATSAPP' });
    expect(res.items.map((c) => c.id)).toEqual([CALL_WA]);
    expect(res.items[0]?.channel).toBe('WHATSAPP');
  });
});

describe('CallsReadService.detail', () => {
  it('returns the call + transcript segments', async () => {
    const call = await svc.detail(C1, CALL_A);
    expect(call.agent.name).toBe('Read Agent');
    expect(call.transcript?.summary).toBe('Greeting exchange.');
    expect((call.transcript?.segments as unknown[]).length).toBe(2);
  });

  it('404s an unknown call', async () => {
    await expect(svc.detail(C1, '00000000-0000-0000-0000-0000009d9999')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });
});
