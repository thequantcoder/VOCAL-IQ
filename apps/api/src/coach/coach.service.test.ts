import type { CoachTurn } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type Actor, CoachService, type KbRetriever } from './coach.service';

/**
 * AI coaching copilot (Day 74) against real Postgres. Proves the never-spoken-to-caller guarantee
 * (self-audit C — every suggestion is agent-only whisper), KB surfacing, objection relevance, the
 * post-call draft + human-confirm flow, and tenant isolation (self-audit B). RAG + the LLM are
 * stubbed so the copilot is deterministic and fast (no live embeddings/model in the loop).
 */

const db = new PrismaService();

// Stub RAG: returns a canned KB chunk (no live embeddings).
const rag: KbRetriever = {
  retrieve: async () => [
    {
      id: 'c1',
      content: 'Pro tier is $49/mo with a 20% annual discount.',
      score: 0.91,
      metadata: { source: 'pricing.md' },
    },
  ],
};
// Stub completer: two suggested replies (mocked relevance). Records the tenantId it was metered for.
const meteredFor: string[] = [];
const complete = async ({ tenantId }: { tenantId: string; system: string; user: string }) => {
  meteredFor.push(tenantId);
  return {
    text: '1. Acknowledge the price concern.\n2. Offer the annual discount.',
    model: 'stub',
  };
};

const svc = new CoachService(db, rag, complete);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000074a0001';
const T2 = '00000000-0000-0000-0000-0000074a0002';
const AGENT = '00000000-0000-0000-0000-0000074a00a1';
const KB = '00000000-0000-0000-0000-0000074a00b1';
const CALL = '00000000-0000-0000-0000-0000074a00c1';
const M1 = '00000000-0000-0000-0000-0000074a00d1';

const actor: Actor = { userId: 'u1', tenantId: T, membershipId: M1, role: 'AGENT' };
const turns: CoachTurn[] = [
  { role: 'agent', text: 'Hi, how can I help?' },
  { role: 'caller', text: 'Honestly this is too expensive and I need to think about it' },
];

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Coach ${id.slice(-4)}`,
        slug: `coach-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'Coach Test Agent' },
    update: {},
  });
  await db.admin.knowledgeBase.upsert({
    where: { id: KB },
    create: { id: KB, tenantId: T, agentId: AGENT, name: 'Pricing KB', sourceType: 'TEXT' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.coachNote.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.knowledgeBase.deleteMany({ where: { id: KB } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('CoachService.suggest', () => {
  it('returns ONLY agent-only whisper suggestions (self-audit C — never spoken to caller)', async () => {
    const { suggestions } = await svc.suggest(T, { callId: CALL, agentId: AGENT, turns });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.audience).toBe('agent');
      expect(s.channel).toBe('whisper');
    }
  });

  it('detects objections + gives a next-best-action + model replies', async () => {
    const { suggestions } = await svc.suggest(T, { callId: CALL, agentId: AGENT, turns });
    const kinds = new Set(suggestions.map((s) => s.kind));
    expect(kinds.has('objection')).toBe(true); // price + stall detected
    expect(kinds.has('next_action')).toBe(true);
    expect(kinds.has('response')).toBe(true);
    expect(suggestions.some((s) => s.kind === 'objection' && /price/i.test(s.title))).toBe(true);
    // the metered completer was invoked for this tenant (cost attribution path — rule #4)
    expect(meteredFor).toContain(T);
  });

  it('surfaces a KB answer grounded on the knowledge base', async () => {
    const { suggestions } = await svc.suggest(T, { callId: CALL, agentId: AGENT, turns });
    const kb = suggestions.find((s) => s.kind === 'kb_answer');
    expect(kb?.body).toMatch(/\$49\/mo/);
    expect(kb?.source).toBe('pricing.md');
  });
});

describe('CoachService post-call draft + confirm', () => {
  let noteId: string;

  it('drafts an UNCONFIRMED note + disposition for the human to review', async () => {
    const note = await svc.postCallDraft(T, { callId: CALL, durationSec: 240, turns });
    noteId = note.id;
    expect(note.confirmed).toBe(false);
    expect(note.disposition).toBe('follow_up'); // objections were raised
    expect(note.notes).toMatch(/AI draft/i);
  });

  it('confirms + edits only on an explicit human action', async () => {
    const confirmed = await svc.confirmNote(actor, noteId, { disposition: 'won' });
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.confirmedBy).toBe(M1);
    expect(confirmed.disposition).toBe('won');
  });
});

describe('CoachService tenant isolation (self-audit B)', () => {
  it("a second tenant cannot confirm or see another tenant's note", async () => {
    const note = await svc.postCallDraft(T, { callId: CALL, durationSec: 60, turns: [] });
    const otherActor: Actor = {
      userId: '00000000-0000-0000-0000-0000074a00e2',
      tenantId: T2,
      membershipId: '00000000-0000-0000-0000-0000074a00d2',
      role: 'AGENT',
    };
    await expect(svc.confirmNote(otherActor, note.id, {})).rejects.toThrow(/not found/i);
    expect(await svc.listNotes(T2)).toEqual([]);
  });
});
