import type { SentimentSignal } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { DeskService } from '../desk/desk.service';
import { SentimentService } from './sentiment.service';

/**
 * Sentiment-triggered live actions (Day 73) against real Postgres. Proves trigger correctness
 * (self-audit A — the right rules fire for a signal), real dispatch (escalate → a desk transfer,
 * alert → a supervisor notification), the DB-backed cooldown that stops alert storms across
 * scale-out (self-audit F), and tenant isolation (self-audit B — one tenant's rules never fire for
 * another).
 */

const db = new PrismaService();
const svc = new SentimentService(db, new DeskService(db));

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000073a0001'; // throwaway tenant that owns the rules
const T2 = '00000000-0000-0000-0000-0000073a0002'; // a second tenant — must never see T's rules
const AGENT = '00000000-0000-0000-0000-0000073a00a1';
const CALL = '00000000-0000-0000-0000-0000073a00c1';
const CALL2 = '00000000-0000-0000-0000-0000073a00c2'; // its own call so cooldown state can't leak from CALL

const angry: SentimentSignal = {
  sentimentScore: -0.8,
  anger: 0.85,
  frustration: 0.7,
  buyingIntent: 0.1,
};
const calm: SentimentSignal = {
  sentimentScore: 0.6,
  anger: 0.05,
  frustration: 0.05,
  buyingIntent: 0.2,
};

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Sentiment ${id.slice(-4)}`,
        slug: `sentiment-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'Sentiment Test Agent' },
    update: {},
  });
  await db.admin.call.upsert({
    where: { id: CALL },
    create: {
      id: CALL,
      tenantId: T,
      agentId: AGENT,
      direction: 'INBOUND',
      channel: 'PSTN',
      status: 'IN_PROGRESS',
    },
    update: { status: 'IN_PROGRESS' },
  });
});

afterAll(async () => {
  await db.admin.sentimentEvent.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.sentimentRule.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.transferRequest.deleteMany({ where: { tenantId: T } });
  await db.admin.notification.deleteMany({ where: { tenantId: T } });
  await db.admin.call.deleteMany({ where: { id: CALL } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('SentimentService rule config', () => {
  it('creates + lists + validates rules (RLS-scoped)', async () => {
    await svc.createRule(T, {
      metric: 'anger',
      operator: 'gt',
      threshold: 0.7,
      action: 'escalate',
      cooldownSec: 60,
    });
    await svc.createRule(T, {
      metric: 'anger',
      operator: 'gt',
      threshold: 0.5,
      action: 'alert_supervisor',
      cooldownSec: 60,
    });
    await svc.createRule(T, {
      metric: 'buyingIntent',
      operator: 'gt',
      threshold: 0.75,
      action: 'alert_supervisor',
      cooldownSec: 120,
    });

    const rules = await svc.listRules(T);
    expect(rules).toHaveLength(3);

    await expect(
      svc.createRule(T, { metric: 'nope', operator: 'gt', threshold: 0.5, action: 'escalate' }),
    ).rejects.toThrow();
  });
});

describe('SentimentService.process (trigger correctness — self-audit A)', () => {
  it('fires nothing for a calm signal', async () => {
    const { actions } = await svc.process(T, CALL, AGENT, calm);
    expect(actions).toEqual([]);
  });

  it('escalates to a human + alerts a supervisor for an angry signal', async () => {
    const now = Date.now();
    const { actions } = await svc.process(T, CALL, AGENT, angry, now);
    const kinds = actions.map((a) => a.action).sort();
    // anger 0.85 > 0.7 → escalate; > 0.5 → alert_supervisor; buyingIntent 0.1 !> 0.75 → no.
    expect(kinds).toEqual(['alert_supervisor', 'escalate']);

    // escalate really created a desk transfer for this call…
    const transfer = await db.admin.transferRequest.findFirst({
      where: { tenantId: T, callId: CALL },
    });
    expect(transfer).not.toBeNull();

    // …and alert_supervisor really created a sentiment_alert notification.
    const note = await db.admin.notification.findFirst({ where: { tenantId: T } });
    expect(note).not.toBeNull();
    expect((note?.payload as { type?: string } | null)?.type).toBe('sentiment_alert');

    // every fired action was logged (also the cooldown source).
    const events = await db.admin.sentimentEvent.findMany({ where: { tenantId: T, callId: CALL } });
    expect(events).toHaveLength(2);
  });
});

describe('SentimentService.process (DB-backed cooldown — self-audit F)', () => {
  it('does not re-fire a rule inside its cooldown, then re-fires after it elapses', async () => {
    const now = Date.now();
    const first = await svc.process(T, CALL2, AGENT, angry, now); // fires (logs events at ~now)
    expect(first.actions.length).toBeGreaterThan(0);

    const cooling = await svc.process(T, CALL2, AGENT, angry, now + 5_000); // 5s later, cooldown 60s
    expect(cooling.actions).toEqual([]);

    const after = await svc.process(T, CALL2, AGENT, angry, now + 70_000); // 70s later — past cooldown
    expect(after.actions.map((a) => a.action).sort()).toEqual(['alert_supervisor', 'escalate']);
  });
});

describe('SentimentService tenant isolation (self-audit B)', () => {
  it('a second tenant sees no rules and fires no actions on the same signal', async () => {
    expect(await svc.listRules(T2)).toEqual([]);
    const { actions } = await svc.process(T2, CALL, AGENT, angry);
    expect(actions).toEqual([]);
  });
});
