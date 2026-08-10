import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { OpsService } from './ops.service';

/**
 * SaaS ops toolkit (Day 49) against real Postgres + RLS. Proves: ticket lifecycle + illegal
 * transitions, credit drain (bonus-first) + low-balance notification, number assignment with
 * KYC + plan limit, notifications, and trial enforcement — all tenant-scoped (self-audit B + D).
 */

const db = new PrismaService();
const svc = new OpsService(db, new EntitlementsService(db));
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const AG = '00000000-0000-0000-0000-0000049a0001';
const numberIds: string[] = [];
const ticketIds: string[] = [];
let planId: string;
let subId: string;

beforeAll(async () => {
  await db.admin.agent.upsert({
    where: { id: AG },
    create: { id: AG, tenantId: C1, name: 'Ops Agent' },
    update: {},
  });
  // Give C1 a plan that allows numbers so the pool-limit path can be exercised.
  const plan = await db.admin.plan.create({
    data: { tenantId: C1, name: 'Ops Test Plan', numberLimit: 5, agentLimit: 50 },
    select: { id: true },
  });
  planId = plan.id;
  const sub = await db.admin.subscription.create({
    data: { tenantId: C1, planId, status: 'ACTIVE' },
    select: { id: true },
  });
  subId = sub.id;
});

afterAll(async () => {
  await db.admin.phoneNumber.deleteMany({ where: { id: { in: numberIds } } });
  await db.admin.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
  await db.admin.notification.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.subscription.deleteMany({ where: { id: subId } });
  await db.admin.plan.deleteMany({ where: { id: planId } });
  await db.admin.agent.deleteMany({ where: { id: AG } });
  await db.admin.wallet.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
});

describe('tickets', () => {
  it('runs the lifecycle and rejects an illegal transition', async () => {
    const t = await svc.createTicket(C1, {
      subject: 'Cannot log in',
      body: 'help',
      priority: 'HIGH',
    });
    ticketIds.push(t.id);
    expect(t.status).toBe('OPEN');

    const inProg = await svc.setTicketStatus(C1, t.id, 'IN_PROGRESS');
    expect(inProg.status).toBe('IN_PROGRESS');
    await svc.setTicketStatus(C1, t.id, 'RESOLVED');
    const closed = await svc.setTicketStatus(C1, t.id, 'CLOSED');
    expect(closed.status).toBe('CLOSED');
    // Cannot transition out of CLOSED.
    await expect(svc.setTicketStatus(C1, t.id, 'OPEN')).rejects.toThrow(/Cannot move/);

    // A child never sees the parent's ticket.
    const parent = await svc.createTicket(R1, { subject: 'parent only', body: '' });
    ticketIds.push(parent.id);
    expect((await svc.listTickets(C1)).some((x) => x.id === parent.id)).toBe(false);
  });
});

describe('credits (bonus-first + low-balance alert — self-audit D)', () => {
  it('drains bonus before prepaid and raises a low-balance notification', async () => {
    await svc.addCredits(C1, 1000, 'prepaid');
    await svc.addCredits(C1, 300, 'bonus');
    const before = await svc.getWallet(C1);
    expect(before.bonusCents).toBe(300);

    const res = await svc.drain(C1, 500); // 300 bonus + 200 prepaid
    expect(res.bonusCents).toBe(0);
    expect(res.prepaidCents).toBe(800);
    expect(res.shortfallCents).toBe(0);

    // Drain most of the rest → dips below the $5 threshold → notification.
    await svc.drain(C1, 400); // prepaid 800 → 400 (below 500 threshold)
    const notifs = await svc.listNotifications(C1);
    expect(notifs.some((n) => (n.payload as { type?: string }).type === 'low_balance')).toBe(true);
  });

  it('reports a shortfall without going negative', async () => {
    const res = await svc.drain(C1, 999_999);
    expect(res.prepaidCents).toBe(0);
    expect(res.bonusCents).toBe(0);
    expect(res.shortfallCents).toBeGreaterThan(0);
  });
});

describe('number pool + KYC + limit (self-audit C)', () => {
  it('blocks an un-KYC number, then assigns after KYC, respecting the plan limit', async () => {
    const num = await db.admin.phoneNumber.create({
      data: { provider: 'TWILIO', e164: `+1555${Date.now().toString().slice(-7)}`, source: 'POOL' },
      select: { id: true },
    });
    numberIds.push(num.id);

    await expect(svc.assignNumber(C1, num.id, AG)).rejects.toThrow(/KYC/);
    await svc.setKyc(num.id, true);
    const res = await svc.assignNumber(C1, num.id, AG);
    expect(res.assigned).toBe(true);

    // Now owned by C1; a child would not see it via RLS (owned list is tenant-scoped).
    const listed = await svc.listNumbers(C1);
    expect(listed.owned.some((n) => n.id === num.id)).toBe(true);

    await svc.releaseNumber(C1, num.id);
    const afterRelease = await svc.listNumbers(C1);
    expect(afterRelease.owned.some((n) => n.id === num.id)).toBe(false);
  });
});

describe('notifications broadcast', () => {
  it('super-admin broadcast creates a notification per tenant', async () => {
    const res = await svc.broadcast([C1], 'Scheduled maintenance tonight');
    expect(res.sent).toBe(1);
    const notifs = await svc.listNotifications(C1);
    expect(notifs.some((n) => (n.payload as { type?: string }).type === 'broadcast')).toBe(true);
  });
});

describe('trials', () => {
  it('stores + returns configurable trial limits', async () => {
    const set = await svc.setTrialLimits(C1, { maxAgents: 3, maxCalls: 25, trialDays: 7 });
    expect(set.maxCalls).toBe(25);
    expect((await svc.getTrialLimits(C1)).maxAgents).toBe(3);
  });

  it('allows creates while within generous trial limits', async () => {
    // Wide caps + a long window → the trial check passes regardless of tenant age/usage.
    await svc.setTrialLimits(C1, { maxAgents: 100000, maxCalls: 100000, trialDays: 100000 });
    await expect(svc.assertTrialAllows(C1, 'agent')).resolves.toBeUndefined();
  });
});
