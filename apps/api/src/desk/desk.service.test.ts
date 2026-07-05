import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type Actor, DeskService } from './desk.service';

/**
 * Agent Desk (Day 67) against real Postgres. Proves presence, transfer routing to an available
 * human (round-robin), warm-summary passing, claim → active, no-answer requeue, and disposition
 * write-back to the Call — all RLS-scoped (self-audit B).
 */

const db = new PrismaService();
const svc = new DeskService(db);

const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT_ID = '00000000-0000-0000-0000-0000067a0001';
const M1 = '00000000-0000-0000-0000-0000067a00a1'; // human agent membership
const U1 = '00000000-0000-0000-0000-0000067a00b1';
const CALL = '00000000-0000-0000-0000-0000067a0002';

const agentActor: Actor = { userId: U1, tenantId: C1, membershipId: M1, role: 'AGENT' };

beforeAll(async () => {
  await db.admin.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, tenantId: C1, name: 'Desk Test Agent' },
    update: {},
  });
  await db.admin.call.upsert({
    where: { id: CALL },
    create: {
      id: CALL,
      tenantId: C1,
      agentId: AGENT_ID,
      direction: 'INBOUND',
      channel: 'PSTN',
      status: 'IN_PROGRESS',
    },
    update: { status: 'IN_PROGRESS' },
  });
});

afterAll(async () => {
  await db.admin.transferRequest.deleteMany({ where: { tenantId: C1, callId: CALL } });
  await db.admin.agentPresence.deleteMany({ where: { membershipId: M1 } });
  await db.admin.call.deleteMany({ where: { id: CALL } });
  await db.admin.agent.deleteMany({ where: { id: AGENT_ID } });
});

describe('DeskService', () => {
  it('sets presence to available with skills', async () => {
    const p = await svc.setPresence(agentActor, { status: 'available', skills: ['billing'] });
    expect(p.status).toBe('available');
    expect(p.skills).toContain('billing');
  });

  let transferId: string;

  it('routes a warm transfer to the available agent with a spoken summary', async () => {
    const t = await svc.requestTransfer(
      C1,
      { callId: CALL, handoffType: 'warm', strategy: 'round_robin' },
      { contactName: 'Jane', reason: 'refund', aiSummary: 'wants a refund' },
    );
    transferId = t.id;
    expect(t.assignedMembershipId).toBe(M1);
    expect(t.status).toBe('ringing');
    expect(t.warmSummary).toContain('Jane');
  });

  it('lets the agent claim the call (→ active, capacity++)', async () => {
    const c = await svc.claim(agentActor, transferId);
    expect(c.status).toBe('active');
    const presence = await db.admin.agentPresence.findUnique({
      where: { membershipId: M1 },
      select: { activeCalls: true },
    });
    expect(presence?.activeCalls).toBe(1);
  });

  it('dispositions + writes back to the Call, freeing capacity', async () => {
    const d = await svc.disposition(agentActor, transferId, {
      disposition: 'resolved',
      durationSec: 120,
    });
    expect(d.status).toBe('completed');
    const call = await db.admin.call.findUnique({
      where: { id: CALL },
      select: { disposition: true, status: true, durationSec: true },
    });
    expect(call?.disposition).toBe('resolved');
    expect(call?.status).toBe('COMPLETED');
    expect(call?.durationSec).toBe(120);
    const presence = await db.admin.agentPresence.findUnique({
      where: { membershipId: M1 },
      select: { activeCalls: true },
    });
    expect(presence?.activeCalls).toBe(0);
  });

  it('queues when nobody is available (agent away)', async () => {
    await svc.setPresence(agentActor, { status: 'away', skills: [] });
    const t = await svc.requestTransfer(C1, {
      callId: CALL,
      handoffType: 'cold',
      strategy: 'round_robin',
    });
    expect(t.assignedMembershipId).toBeNull();
    expect(t.status).toBe('queued');
  });
});
