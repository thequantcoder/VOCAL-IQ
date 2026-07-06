import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { IntelService } from './intel.service';

/**
 * Conversation intelligence (Day 75) against real Postgres. Proves deterministic extraction from a
 * transcript (self-audit A — no LLM in the loop, self-audit D), idempotent re-extraction, trend
 * aggregation, threshold alerting (→ a real notification), and tenant isolation (self-audit B).
 */

const db = new PrismaService();
const svc = new IntelService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000075a0001';
const T2 = '00000000-0000-0000-0000-0000075a0002';
const AGENT = '00000000-0000-0000-0000-0000075a00a1';
const CALL = '00000000-0000-0000-0000-0000075a00c1';

const SEARCH_TEXT =
  'This is too expensive for us. We currently use Acme. Do you support Salesforce? ' +
  "How much does it cost? Honestly I'm thinking of leaving our current vendor.";

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Intel ${id.slice(-4)}`,
        slug: `intel-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'Intel Test Agent' },
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
      status: 'COMPLETED',
    },
    update: {},
  });
  await db.admin.transcript.upsert({
    where: { callId: CALL },
    create: { callId: CALL, tenantId: T, searchText: SEARCH_TEXT },
    update: { searchText: SEARCH_TEXT },
  });
});

afterAll(async () => {
  await db.admin.callSignal.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.conversationIntelConfig.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.notification.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.transcript.deleteMany({ where: { callId: CALL } });
  await db.admin.call.deleteMany({ where: { id: CALL } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('IntelService config', () => {
  it('sets + reads the competitor watchlist and alert rules', async () => {
    const cfg = await svc.setConfig(T, {
      competitors: ['Acme', 'Globex'],
      alertRules: [{ type: 'competitor', label: 'Acme', threshold: 1 }],
    });
    expect(cfg.competitors).toContain('Acme');
    expect(cfg.alertRules[0]?.threshold).toBe(1);
    // rejects malformed rules
    await expect(
      svc.setConfig(T, { competitors: [], alertRules: [{ type: 'nope', threshold: 1 }] }),
    ).rejects.toThrow();
  });
});

describe('IntelService.extractForCall (self-audit A + D — deterministic, no LLM)', () => {
  it('mines every signal type from the transcript', async () => {
    const { signals } = await svc.extractForCall(T, CALL);
    const types = new Set(signals.map((s) => s.type));
    expect(types.has('objection')).toBe(true); // too expensive → price
    expect(types.has('competitor')).toBe(true); // Acme (on the watchlist)
    expect(types.has('feature_request')).toBe(true); // do you support
    expect(types.has('buying_signal')).toBe(true); // how much does it cost
    expect(types.has('churn_risk')).toBe(true); // thinking of leaving
    expect(signals.find((s) => s.type === 'competitor')?.label).toBe('Acme');
  });

  it('is idempotent — re-extracting replaces, never duplicates', async () => {
    const first = await svc.extractForCall(T, CALL);
    const second = await svc.extractForCall(T, CALL);
    const persisted = await db.admin.callSignal.count({ where: { tenantId: T, callId: CALL } });
    expect(persisted).toBe(first.signals.length);
    expect(second.signals.length).toBe(first.signals.length);
  });
});

describe('IntelService trends + alerts', () => {
  it('aggregates signals into trend counts', async () => {
    await svc.extractForCall(T, CALL);
    const trends = await svc.trends(T, 30);
    expect(trends.some((t) => t.type === 'competitor' && t.label === 'Acme' && t.count >= 1)).toBe(
      true,
    );
  });

  it('fires an alert + notification when a competitor threshold is breached', async () => {
    await svc.extractForCall(T, CALL);
    const { fired } = await svc.checkAlerts(T, 30);
    expect(fired.some((f) => f.type === 'competitor' && f.label === 'Acme')).toBe(true);
    const note = await db.admin.notification.findFirst({ where: { tenantId: T } });
    expect((note?.payload as { type?: string } | null)?.type).toBe('conversation_intel_alert');
  });
});

describe('IntelService tenant isolation (self-audit B)', () => {
  it('a second tenant sees no config, trends, or signals from the first', async () => {
    expect((await svc.getConfig(T2)).competitors).toEqual([]);
    expect(await svc.trends(T2, 30)).toEqual([]);
    expect(await svc.listSignals(T2)).toEqual([]);
  });
});
