import {
  type Battlecard,
  type CoachSuggestion,
  type CopilotTurn,
  MAX_SESSION_TURNS,
  NotFoundError,
  ValidationError,
  assertAgentOnly,
  battlecardInputSchema,
  battlecardSuggestions,
  buildCoachMessages,
  buildCrmPrompt,
  detectObjections,
  matchBattlecards,
  nextBestAction,
  parseCrmDraft,
  sealAgentOnly,
  startSessionSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Live Call Co-Pilot for HUMAN sales teams (Day 90) — the standalone wedge product. A rep runs a
 * session over their OWN live call (softphone/SIP/web — no VocalIQ Agent or Call needed); the co-pilot
 * transcribes turns in, surfaces battlecards + objection handling live, and after the call drafts CRM
 * notes the human confirms. It builds on the Day-74 coaching core, so its guarantees are inherited:
 *  - C (privacy): every live suggestion is `sealAgentOnly` (agent-only, whisper) and re-checked by
 *    `assertAgentOnly` before returning — this service has NO path to the spoken/TTS channel, so a
 *    suggestion (or a battlecard) can never be read to the caller.
 *  - B (isolation): sessions + battlecards are `db.withTenant`-scoped — a rep only ever sees their own
 *    tenant's data, and a foreign session/card → NotFound.
 *  - A (draft, not final): `endSession` writes an UNCONFIRMED CRM draft; only `confirmCrm` (a human
 *    action) finalizes it. D: the assist + CRM draft are single metered LLM calls over bounded turns.
 */

/** The metered completer — routes through RouterService in composition (rule #4 — no un-metered path). */
export type CopilotCompleter = (args: {
  tenantId: string;
  system: string;
  user: string;
}) => Promise<{ text: string; model?: string }>;

export interface Actor {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: string;
}

/** The stored view of a co-pilot session (turns + CRM draft are opaque JSON to the caller). */
export interface CopilotSessionView {
  id: string;
  userId: string | null;
  title: string | null;
  contactName: string | null;
  company: string | null;
  channel: string;
  status: string;
  turns: unknown;
  crmDraft: unknown;
  crmConfirmed: boolean;
  durationSec: number;
  model: string | null;
  createdAt: Date;
  endedAt: Date | null;
}

/** The stored view of a battlecard row. */
export interface BattlecardView {
  id: string;
  competitor: string;
  cues: string[];
  talkingPoints: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SESSION_SELECT = {
  id: true,
  userId: true,
  title: true,
  contactName: true,
  company: true,
  channel: true,
  status: true,
  turns: true,
  crmDraft: true,
  crmConfirmed: true,
  durationSec: true,
  model: true,
  createdAt: true,
  endedAt: true,
} as const;

const CARD_SELECT = {
  id: true,
  competitor: true,
  cues: true,
  talkingPoints: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class CopilotService {
  constructor(
    private readonly db: PrismaService,
    private readonly complete: CopilotCompleter,
  ) {}

  // ── sessions ────────────────────────────────────────────────────────────────────

  /** Start a co-pilot session on a human-led call. No agent/call required — this is the standalone product. */
  async startSession(actor: Actor, input: unknown): Promise<CopilotSessionView> {
    const parsed = startSessionSchema.safeParse(input ?? {});
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid session');
    const { title, contactName, company, channel } = parsed.data;
    return this.db.withTenant(actor.tenantId, (tx) =>
      tx.copilotSession.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.userId || null,
          membershipId: actor.membershipId || null,
          channel,
          status: 'live',
          ...(title ? { title } : {}),
          ...(contactName ? { contactName } : {}),
          ...(company ? { company } : {}),
        },
        select: SESSION_SELECT,
      }),
    );
  }

  /**
   * Live assist: append the newest transcribed turns to the session, then return agent-only whisper
   * suggestions (model replies + battlecards on a competitor mention + objection handling + next
   * action) plus the matched battlecards for the panel. Everything returned is agent-only (self-audit C).
   */
  async assist(
    tenantId: string,
    sessionId: string,
    input: { turns: CopilotTurn[]; sentiment?: number; hasQuote?: boolean },
  ): Promise<{ suggestions: CoachSuggestion[]; battlecards: Battlecard[] }> {
    const session = await this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.findFirst({
        where: { id: sessionId },
        select: { id: true, status: true, turns: true },
      }),
    );
    if (!session) throw new NotFoundError('Co-pilot session not found');
    if (session.status !== 'live') throw new ValidationError('Session has ended');

    // Accumulate turns on the session (bounded — self-audit D/F), keeping the most recent.
    const prior = (session.turns as unknown as CopilotTurn[]) ?? [];
    const allTurns = [...prior, ...input.turns].slice(-MAX_SESSION_TURNS);

    const lastCaller = [...input.turns].reverse().find((t) => t.role === 'caller')?.text ?? '';
    const objections = detectObjections(lastCaller);

    // Tenant's active battlecards → the ones this caller utterance triggers.
    const cards = await this.listBattlecards(tenantId, true);
    const matched = matchBattlecards(lastCaller, cards);

    const suggestions: CoachSuggestion[] = [];

    // 1) Model-suggested replies (one metered call), grounded on the recent turns + objections. Only
    // when there are NEW turns — an empty poll never spends (self-audit D).
    if (input.turns.length > 0 && allTurns.length > 0) {
      const messages = buildCoachMessages({ turns: allTurns.slice(-8), objections, kb: [] });
      const out = await this.complete({ tenantId, system: messages.system, user: messages.user });
      const replies = out.text
        .split('\n')
        .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter((l) => l.length > 0)
        .slice(0, 3);
      for (const [i, body] of replies.entries()) {
        suggestions.push(
          sealAgentOnly({
            kind: 'response',
            title: `Suggested reply ${i + 1}`,
            body,
            confidence: 0.72,
          }),
        );
      }
    }

    // 2) Battlecards (competitor handling) → sealed agent-only suggestions.
    suggestions.push(...battlecardSuggestions(matched));

    // 3) Objection handling.
    for (const o of objections) {
      suggestions.push(
        sealAgentOnly({ kind: 'objection', title: o.label, body: o.rebuttal, confidence: 0.7 }),
      );
    }

    // 4) The single next-best-action.
    const nba = nextBestAction({
      objections: objections.map((o) => o.tag),
      ...(typeof input.sentiment === 'number' ? { sentiment: input.sentiment } : {}),
      ...(input.hasQuote ? { hasQuote: input.hasQuote } : {}),
    });
    suggestions.push(
      sealAgentOnly({
        kind: 'next_action',
        title: `Next: ${nba.action}`,
        body: nba.rationale,
        confidence: 0.65,
      }),
    );

    // The never-spoken-to-caller backstop — refuse to emit anything that isn't agent-only whisper.
    for (const s of suggestions) assertAgentOnly(s);

    // Persist the accumulated turns.
    await this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.update({ where: { id: sessionId }, data: { turns: allTurns as object } }),
    );

    return { suggestions, battlecards: matched };
  }

  /**
   * End the session + draft the CRM fields (one metered call over the accumulated transcript). The
   * draft is stored UNCONFIRMED — only `confirmCrm` finalizes it (self-audit A). Idempotent-safe: a
   * re-end just re-drafts.
   */
  async endSession(
    tenantId: string,
    sessionId: string,
    input: { durationSec?: number },
  ): Promise<CopilotSessionView> {
    const session = await this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.findFirst({ where: { id: sessionId }, select: { id: true, turns: true } }),
    );
    if (!session) throw new NotFoundError('Co-pilot session not found');

    const turns = (session.turns as unknown as CopilotTurn[]) ?? [];
    let crmDraft: object | null = null;
    let model: string | null = null;
    if (turns.length > 0) {
      const { system, user } = buildCrmPrompt(turns);
      const out = await this.complete({ tenantId, system, user });
      crmDraft = parseCrmDraft(out.text) as object;
      model = out.model ?? null;
    }

    return this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.update({
        where: { id: sessionId },
        data: {
          status: 'ended',
          endedAt: new Date(),
          crmConfirmed: false,
          ...(typeof input.durationSec === 'number' ? { durationSec: input.durationSec } : {}),
          ...(crmDraft ? { crmDraft } : {}),
          ...(model ? { model } : {}),
        },
        select: SESSION_SELECT,
      }),
    );
  }

  /** The human confirms (and optionally edits) the CRM draft — the ONLY path that finalizes it (self-audit A). */
  async confirmCrm(
    tenantId: string,
    sessionId: string,
    edits?: Record<string, unknown>,
  ): Promise<CopilotSessionView> {
    const session = await this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.findFirst({
        where: { id: sessionId },
        select: { id: true, crmDraft: true },
      }),
    );
    if (!session) throw new NotFoundError('Co-pilot session not found');
    const merged = { ...((session.crmDraft as object) ?? {}), ...(edits ?? {}) };
    return this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.update({
        where: { id: sessionId },
        data: { crmDraft: merged as object, crmConfirmed: true },
        select: SESSION_SELECT,
      }),
    );
  }

  async listSessions(tenantId: string): Promise<CopilotSessionView[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: SESSION_SELECT,
      }),
    );
  }

  async getSession(tenantId: string, sessionId: string): Promise<CopilotSessionView> {
    const s = await this.db.withTenant(tenantId, (tx) =>
      tx.copilotSession.findFirst({ where: { id: sessionId }, select: SESSION_SELECT }),
    );
    if (!s) throw new NotFoundError('Co-pilot session not found');
    return s;
  }

  // ── battlecards (CRUD) ────────────────────────────────────────────────────────────

  /** The tenant's battlecards (optionally only active ones), mapped to the shared `Battlecard` shape. */
  async listBattlecards(tenantId: string, activeOnly = false): Promise<Battlecard[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.battlecard.findMany({
        where: activeOnly ? { active: true } : {},
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: CARD_SELECT,
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      competitor: r.competitor,
      cues: r.cues,
      talkingPoints: (r.talkingPoints as unknown as string[]) ?? [],
    }));
  }

  async createBattlecard(tenantId: string, input: unknown): Promise<BattlecardView> {
    const parsed = battlecardInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid battlecard');
    const { competitor, cues, talkingPoints, active } = parsed.data;
    return this.db.withTenant(tenantId, (tx) =>
      tx.battlecard.create({
        data: { tenantId, competitor, cues, talkingPoints: talkingPoints as object, active },
        select: CARD_SELECT,
      }),
    );
  }

  async updateBattlecard(
    tenantId: string,
    id: string,
    input: unknown,
  ): Promise<BattlecardView | null> {
    const parsed = battlecardInputSchema.partial().safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid battlecard');
    const data = parsed.data;
    const res = await this.db.withTenant(tenantId, (tx) =>
      tx.battlecard.updateMany({
        where: { id },
        data: {
          ...(data.competitor !== undefined ? { competitor: data.competitor } : {}),
          ...(data.cues !== undefined ? { cues: data.cues } : {}),
          ...(data.talkingPoints !== undefined
            ? { talkingPoints: data.talkingPoints as object }
            : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
      }),
    );
    if (res.count === 0) throw new NotFoundError('Battlecard not found');
    return this.db.withTenant(tenantId, (tx) =>
      tx.battlecard.findFirst({ where: { id }, select: CARD_SELECT }),
    );
  }

  async deleteBattlecard(tenantId: string, id: string) {
    const res = await this.db.withTenant(tenantId, (tx) =>
      tx.battlecard.deleteMany({ where: { id } }),
    );
    if (res.count === 0) throw new NotFoundError('Battlecard not found');
    return { id };
  }
}
