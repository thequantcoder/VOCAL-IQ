import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type Actor, type CopilotCompleter, CopilotService } from './copilot.service';

/**
 * Live Co-Pilot (Day 90) — real Postgres, RLS-scoped. Proves the standalone human-led session (no
 * agent/call), live assist reusing the whisper core (agent-only — self-audit C), battlecards surfaced
 * on a competitor mention, the post-call CRM DRAFT + human confirm (self-audit A), and tenant
 * isolation (self-audit B). A fake completer returns coach replies vs a CRM JSON depending on the
 * prompt (in prod it routes through the metered router).
 */

const db = new PrismaService();

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T1 = '00000000-0000-0000-0000-0000090a0001';
const T2 = '00000000-0000-0000-0000-0000090a0002';
const U1 = '00000000-0000-0000-0000-0000090a00d1';
const M1 = '00000000-0000-0000-0000-0000090a00e1';

const actor1: Actor = { userId: U1, tenantId: T1, membershipId: M1, role: 'OWNER' };
const actor2: Actor = { userId: U1, tenantId: T2, membershipId: M1, role: 'OWNER' };

let coachCalls = 0;
let crmCalls = 0;
const fakeComplete: CopilotCompleter = async ({ system }) => {
  if (system.includes('CRM fields')) {
    crmCalls += 1;
    return {
      text: '{"contactName":"Jane Doe","company":"Globex","summary":"Wants a demo next week.","nextSteps":["Send pricing"],"disposition":"follow_up"}',
      model: 'fake-crm-v1',
    };
  }
  coachCalls += 1;
  return {
    text: '1. Acknowledge the price concern.\n2. Offer a lower tier.',
    model: 'fake-coach-v1',
  };
};
const svc = new CopilotService(db, fakeComplete);

beforeAll(async () => {
  for (const id of [T1, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Copilot ${id.slice(-4)}`,
        slug: `copilot-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.battlecard.create({
    data: {
      tenantId: T1,
      competitor: 'Acme Dialer',
      cues: ['acme'],
      talkingPoints: ['We include analytics Acme charges extra for.', 'No per-seat lock-in.'],
      active: true,
    },
  });
});

afterAll(async () => {
  await db.admin.copilotSession.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.battlecard.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T1, T2] } } });
});

describe('Standalone session + live assist (self-audit C — agent-only)', () => {
  let sessionId = '';

  it('starts a human-led session with no agent/call', async () => {
    const s = await svc.startSession(actor1, { title: 'Cold call — Globex', channel: 'web' });
    expect(s.status).toBe('live');
    expect(s.userId).toBe(U1);
    sessionId = s.id;
  });

  it('assists live: model replies + a battlecard on a competitor mention + objection + next action', async () => {
    coachCalls = 0;
    const res = await svc.assist(T1, sessionId, {
      turns: [
        { role: 'agent', text: 'Hi, thanks for taking my call.' },
        { role: 'caller', text: "We're currently using Acme and honestly it's too expensive." },
      ],
    });
    expect(coachCalls).toBe(1); // exactly one metered LLM call for the replies

    // Battlecard surfaced for the competitor mention.
    expect(res.battlecards.map((c) => c.competitor)).toEqual(['Acme Dialer']);
    const titles = res.suggestions.map((s) => s.title);
    expect(titles).toContain('vs Acme Dialer'); // battlecard → sealed suggestion
    expect(
      res.suggestions.some((s) => s.kind === 'objection' && s.title === 'Price objection'),
    ).toBe(true);
    expect(res.suggestions.some((s) => s.kind === 'response')).toBe(true);
    expect(res.suggestions.some((s) => s.kind === 'next_action')).toBe(true);

    // THE guarantee: every emitted suggestion is agent-only whisper — never spoken to the caller.
    for (const s of res.suggestions) {
      expect(s.audience).toBe('agent');
      expect(s.channel).toBe('whisper');
    }

    // Turns are accumulated on the session.
    const reread = await svc.getSession(T1, sessionId);
    expect((reread.turns as unknown[]).length).toBe(2);
  });

  it('an empty poll (no new turns) never spends on the model (self-audit D)', async () => {
    coachCalls = 0;
    const res = await svc.assist(T1, sessionId, { turns: [] });
    expect(coachCalls).toBe(0);
    // A cheap default next-action still comes back with zero LLM spend.
    expect(res.suggestions.every((s) => s.kind === 'next_action')).toBe(true);
  });

  it('refuses to assist a session that has ended', async () => {
    const s = await svc.startSession(actor1, {});
    await svc.endSession(T1, s.id, {});
    await expect(
      svc.assist(T1, s.id, { turns: [{ role: 'caller', text: 'hi' }] }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('ends the session with a CRM DRAFT the human then confirms (self-audit A)', async () => {
    crmCalls = 0;
    const ended = await svc.endSession(T1, sessionId, { durationSec: 240 });
    expect(ended.status).toBe('ended');
    expect(crmCalls).toBe(1);
    expect(ended.crmConfirmed).toBe(false); // AI never finalizes
    const draft = ended.crmDraft as { company: string; disposition: string };
    expect(draft.company).toBe('Globex');
    expect(draft.disposition).toBe('follow_up');

    // The human confirms + edits — the ONLY path that finalizes.
    const confirmed = await svc.confirmCrm(T1, sessionId, { disposition: 'won' });
    expect(confirmed.crmConfirmed).toBe(true);
    expect((confirmed.crmDraft as { disposition: string }).disposition).toBe('won');
    expect((confirmed.crmDraft as { company: string }).company).toBe('Globex'); // merge preserved
  });
});

describe('Battlecard CRUD', () => {
  it('creates, updates, and validates battlecards', async () => {
    const card = await svc.createBattlecard(T1, {
      competitor: 'DialPro',
      cues: ['dialpro'],
      talkingPoints: ['Faster setup than DialPro.'],
    });
    expect(card.competitor).toBe('DialPro');
    const updated = await svc.updateBattlecard(T1, card.id, { active: false });
    expect(updated?.active).toBe(false);
    // An inactive card is not surfaced to the live assist.
    const active = await svc.listBattlecards(T1, true);
    expect(active.map((c) => c.competitor)).not.toContain('DialPro');
    await expect(svc.createBattlecard(T1, { competitor: '' })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });
});

describe('Isolation (self-audit B)', () => {
  it('a tenant never sees or acts on another tenant’s sessions/battlecards', async () => {
    const s = await svc.startSession(actor1, { title: 'private' });
    await expect(svc.getSession(T2, s.id)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
    await expect(
      svc.assist(T2, s.id, { turns: [{ role: 'caller', text: 'hi' }] }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'NOT_FOUND');
    // T2 has no battlecards of its own.
    expect(await svc.listBattlecards(T2)).toHaveLength(0);
    // T2 assisting its own (empty) session must NOT match T1's Acme card.
    const s2 = await svc.startSession(actor2, {});
    const res = await svc.assist(T2, s2.id, {
      turns: [{ role: 'caller', text: 'we use acme currently' }],
    });
    expect(res.battlecards).toHaveLength(0);
  });
});
