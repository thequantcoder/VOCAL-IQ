import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ReputationService } from './reputation.service';

/**
 * Caller reputation (Day 69) against real Postgres. Proves attestation recording, reputation
 * scoring + auto-rest on a flagged number (via an injected spam-label provider), the pre-dial
 * gate (rested → blocked), and branded caller ID — all RLS-scoped (self-audit B).
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT = '00000000-0000-0000-0000-0000069a0001';
const CALL = '00000000-0000-0000-0000-0000069a0002';
const NUM = '00000000-0000-0000-0000-0000069a0003';

// A "flagged" spam-label provider to exercise auto-rest.
const flaggedSvc = new ReputationService(db, async () => 'flagged');
const cleanSvc = new ReputationService(db, async () => 'clean');

beforeAll(async () => {
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Rep Agent' },
    update: {},
  });
  await db.admin.call.upsert({
    where: { id: CALL },
    create: {
      id: CALL,
      tenantId: C1,
      agentId: AGENT,
      direction: 'OUTBOUND',
      channel: 'PSTN',
      status: 'COMPLETED',
    },
    update: {},
  });
  await db.admin.phoneNumber.upsert({
    where: { id: NUM },
    create: {
      id: NUM,
      tenantId: C1,
      provider: 'TWILIO',
      e164: `+1500555${Date.now() % 10000}`,
      createdAt: new Date(),
    },
    update: { restedUntil: null, reputationScore: null, spamLabel: null },
  });
});

afterAll(async () => {
  await db.admin.phoneNumber.deleteMany({ where: { id: NUM } });
  await db.admin.call.deleteMany({ where: { id: CALL } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
});

describe('ReputationService', () => {
  it('records STIR/SHAKEN attestation on a call', async () => {
    await cleanSvc.recordAttestation(C1, CALL, 'A');
    const call = await db.admin.call.findUnique({
      where: { id: CALL },
      select: { attestation: true },
    });
    expect(call?.attestation).toBe('A');
  });

  it('sets branded caller ID', async () => {
    const b = await cleanSvc.setBrandedCallerId(C1, NUM, { displayName: 'Acme Support' });
    expect(b.displayName).toBe('Acme Support');
  });

  it('scores + auto-rests a flagged number, then the pre-dial gate blocks it', async () => {
    const r = await flaggedSvc.refresh(C1, NUM);
    expect(r.label).toBe('flagged');
    expect(r.rested).toBe(true);

    const gate = await flaggedSvc.canDial(C1, NUM);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('resting');
  });

  it('reports number health with warm-up cap', async () => {
    const health = await cleanSvc.health(C1);
    const n = health.find((h) => h.id === NUM);
    expect(n).toBeTruthy();
    expect(n!.warmupCapToday).toBeGreaterThan(0);
  });
});
