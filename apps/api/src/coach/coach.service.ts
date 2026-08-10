import {
  type CoachSuggestion,
  type CoachTurn,
  NotFoundError,
  assertAgentOnly,
  buildCoachMessages,
  detectObjections,
  draftDisposition,
  nextBestAction,
  sealAgentOnly,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * AI coaching / "whisper" copilot for human agents (Day 74). A private assistant on the Agent Desk:
 * given the live turns of a human-handled call it returns suggested replies, KB answers, objection
 * handling, and a next-best-action — and, after the call, an auto-note + disposition DRAFT the
 * human confirms. THE GUARANTEE (self-audit C): every output is agent-only whisper — this service
 * has no dependency on and no path to the spoken/TTS channel, and it runs `assertAgentOnly` over
 * every suggestion before returning. All reads/writes are RLS-scoped (B); the LLM call is metered
 * through the injected completer (which routes via RouterService in composition — rule #4).
 */

/** Narrow view of RAG retrieval so the copilot can be tested without live embeddings. */
export interface KbRetriever {
  retrieve(
    tenantId: string,
    kbId: string,
    query: string,
    k?: number,
  ): Promise<{ id: string; content: string; score: number; metadata: unknown }[]>;
}

/** The metered completer — `({tenantId, system, user}) => {text}` — wired to RouterService in composition. */
export type CoachCompleter = (args: {
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

export interface SuggestInput {
  callId: string;
  agentId?: string;
  turns: CoachTurn[];
  sentiment?: number;
  hasQuote?: boolean;
}

export class CoachService {
  constructor(
    private readonly db: PrismaService,
    private readonly rag: KbRetriever,
    private readonly complete: CoachCompleter,
  ) {}

  /**
   * Live copilot for a call in progress. Detects objections in the latest caller turn, grounds on
   * the agent's knowledge base, asks the model for concise suggested replies, and adds the next-
   * best-action. Returns agent-only whisper suggestions — never anything spoken to the caller.
   */
  async suggest(
    tenantId: string,
    input: SuggestInput,
  ): Promise<{ suggestions: CoachSuggestion[] }> {
    const lastCaller = [...input.turns].reverse().find((t) => t.role === 'caller')?.text ?? '';
    const objections = detectObjections(lastCaller);

    // Ground on the agent's KB (or any tenant KB) when there's a caller question to answer.
    const kb: { content: string; source?: string }[] = [];
    if (lastCaller.trim().length > 0) {
      const kbRow = await this.db.withTenant(tenantId, (tx) =>
        tx.knowledgeBase.findFirst({
          where: input.agentId ? { OR: [{ agentId: input.agentId }, { agentId: null }] } : {},
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        }),
      );
      if (kbRow) {
        const chunks = await this.rag.retrieve(tenantId, kbRow.id, lastCaller, 3);
        for (const c of chunks) {
          const src = (c.metadata as { source?: string } | null)?.source;
          kb.push({ content: c.content, ...(src ? { source: src } : {}) });
        }
      }
    }

    const suggestions: CoachSuggestion[] = [];

    // 1) Model-suggested replies (metered), grounded on the turns + objections + KB.
    if (input.turns.length > 0) {
      const messages = buildCoachMessages({ turns: input.turns, objections, kb });
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

    // 2) KB answers (grounding facts the agent can quote).
    for (const k of kb) {
      suggestions.push(
        sealAgentOnly({
          kind: 'kb_answer',
          title: 'From your knowledge base',
          body: k.content,
          confidence: 0.8,
          ...(k.source ? { source: k.source } : {}),
        }),
      );
    }

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

    // The never-spoken-to-caller backstop: refuse to emit anything that isn't agent-only whisper.
    for (const s of suggestions) assertAgentOnly(s);

    return { suggestions };
  }

  /**
   * Post-call: generate an auto-note + disposition DRAFT for the human to confirm. The AI never
   * finalizes — it writes an unconfirmed `CoachNote`; `confirmNote` is the only thing that confirms.
   */
  async postCallDraft(
    tenantId: string,
    input: { callId: string; durationSec: number; turns: CoachTurn[]; resolved?: boolean },
  ) {
    const callerText = input.turns
      .filter((t) => t.role === 'caller')
      .map((t) => t.text)
      .join(' ');
    const objections = detectObjections(callerText).map((o) => o.tag);
    const base = draftDisposition({
      durationSec: input.durationSec,
      objections,
      ...(typeof input.resolved === 'boolean' ? { resolved: input.resolved } : {}),
    });

    // A polished AI summary note (metered) when there's a conversation to summarise; else the draft.
    let notes = base.note;
    if (input.turns.length > 0) {
      const convo = input.turns
        .map((t) => `${t.role === 'caller' ? 'Caller' : 'Agent'}: ${t.text}`)
        .join('\n');
      const out = await this.complete({
        tenantId,
        system:
          'You write a concise post-call note for a human agent to review. 2-3 sentences, factual, ' +
          'no invented details. This is an internal note, never shown to the caller.',
        user: `Call transcript:\n${convo}\n\nWrite the note.`,
      });
      if (out.text.trim()) notes = `[AI draft — please review] ${out.text.trim()}`;
    }

    return this.db.withTenant(tenantId, (tx) =>
      tx.coachNote.create({
        data: {
          tenantId,
          callId: input.callId,
          disposition: base.disposition,
          notes,
          confirmed: false,
        },
        select: NOTE_SELECT,
      }),
    );
  }

  /** The human confirms (and optionally edits) the AI draft — the only path that finalizes it. */
  async confirmNote(
    actor: Actor,
    noteId: string,
    edits?: { disposition?: string; notes?: string },
  ) {
    const res = await this.db.withTenant(actor.tenantId, (tx) =>
      tx.coachNote.updateMany({
        where: { id: noteId },
        data: {
          confirmed: true,
          confirmedBy: actor.membershipId || null,
          confirmedAt: new Date(),
          ...(edits?.disposition ? { disposition: edits.disposition } : {}),
          ...(edits?.notes ? { notes: edits.notes } : {}),
        },
      }),
    );
    if (res.count === 0) throw new NotFoundError('Coach note not found');
    const note = await this.db.withTenant(actor.tenantId, (tx) =>
      tx.coachNote.findFirst({ where: { id: noteId }, select: NOTE_SELECT }),
    );
    if (!note) throw new NotFoundError('Coach note not found');
    return note;
  }

  /** Notes for a call (or the tenant's recent) — the desk review view. */
  async listNotes(tenantId: string, callId?: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.coachNote.findMany({
        where: callId ? { callId } : {},
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: NOTE_SELECT,
      }),
    );
  }
}

const NOTE_SELECT = {
  id: true,
  callId: true,
  disposition: true,
  notes: true,
  confirmed: true,
  confirmedBy: true,
  confirmedAt: true,
  createdAt: true,
} as const;
