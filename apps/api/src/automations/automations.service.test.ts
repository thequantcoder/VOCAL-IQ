import type { AutomationAction, AutomationEvent } from '@vocaliq/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type ActionExecutors, AutomationsService } from './automations.service';

/**
 * Cross-channel automations (Day 47) against real Postgres + RLS. Proves: CRUD, trigger
 * MATCHING (event + filters), multi-step action chains run in order best-effort (one failing
 * action doesn't stop the rest), every action is audited, and tenant isolation (self-audit A + B).
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';

const calls: { type: string; event: AutomationEvent }[] = [];
const ok = vi.fn(async (_t: string, event: AutomationEvent, a: AutomationAction) => {
  calls.push({ type: a.type, event });
  return { status: 'ok' as const };
});
const boom = vi.fn(async () => {
  throw new Error('executor blew up');
});

// send_message succeeds, webhook throws — proves best-effort ordering + error capture.
const executors: ActionExecutors = {
  send_message: ok,
  crm_sync: ok,
  webhook: boom,
  task: ok,
  notify: ok,
};
const svc = new AutomationsService(db, executors);

const ids: string[] = [];

afterAll(async () => {
  await db.admin.auditLog.deleteMany({
    where: { tenantId: { in: [C1, R1] }, action: 'automation.action' },
  });
  await db.admin.automation.deleteMany({ where: { id: { in: ids } } });
});

async function mk(
  tenantId: string,
  over: Partial<Parameters<AutomationsService['create']>[1]> = {},
) {
  const a = await svc.create(tenantId, {
    name: 'Missed-call follow-up',
    trigger: { event: 'call_ended', filters: { disposition: 'NO_ANSWER' } },
    actions: [
      { type: 'send_message', channel: 'SMS', body: 'Sorry we missed you!' },
      { type: 'webhook', url: 'https://hooks.example.com/x' }, // this executor throws
      { type: 'crm_sync' },
    ],
    active: true,
    ...over,
  });
  ids.push(a.id);
  return a;
}

describe('AutomationsService CRUD (RLS)', () => {
  it('creates, lists, toggles and scopes automations to the tenant', async () => {
    const a = await mk(C1);
    expect(a.actions).toHaveLength(3);
    expect((await svc.list(C1)).some((x) => x.id === a.id)).toBe(true);

    const off = await svc.setActive(C1, a.id, false);
    expect(off.active).toBe(false);
    await svc.setActive(C1, a.id, true);

    // A child can't see a parent's automation.
    const parent = await mk(R1);
    expect((await svc.list(C1)).some((x) => x.id === parent.id)).toBe(false);
  });
});

describe('AutomationsService.dispatch', () => {
  it('runs matching automations action-by-action, best-effort, and audits each', async () => {
    calls.length = 0;
    ok.mockClear();
    await mk(C1);
    const event: AutomationEvent = {
      event: 'call_ended',
      disposition: 'NO_ANSWER',
      callId: '00000000-0000-0000-0000-0000047a0001',
      to: '+15551230000',
    };
    const res = await svc.dispatch(C1, event);

    expect(res.matched).toBeGreaterThanOrEqual(1);
    // The webhook action errored but crm_sync still ran after it (best-effort ordering).
    const statuses = res.actions.map((a) => a.status);
    expect(statuses).toContain('ok');
    expect(statuses).toContain('error');
    expect(calls.some((c) => c.type === 'crm_sync')).toBe(true);

    // Every action wrote an audit row.
    const audits = await db.admin.auditLog.findMany({
      where: { tenantId: C1, action: 'automation.action' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT fire when the disposition filter does not match', async () => {
    const res = await svc.dispatch(C1, { event: 'call_ended', disposition: 'BOOKED' });
    expect(res.matched).toBe(0);
    expect(res.actions).toHaveLength(0);
  });

  it('does NOT fire a parent automation for a child tenant (self-audit B)', async () => {
    // R1 has a matching automation; dispatching for C1 must not run it.
    await mk(R1);
    const res = await svc.dispatch(C1, { event: 'call_ended', disposition: 'NO_ANSWER' });
    // Only C1's own automations count — never R1's (RLS scopes the candidate query).
    for (const a of res.actions) {
      const owned = await db.admin.automation.findFirst({
        where: { id: a.automationId, tenantId: C1 },
      });
      expect(owned).not.toBeNull();
    }
  });
});
