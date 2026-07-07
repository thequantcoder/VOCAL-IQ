import {
  type AnalysisCall,
  type LearningSettings,
  MAX_TRAINING_CALLS,
  NotFoundError,
  ValidationError,
  appendPlaybook,
  buildAnalysisPrompt,
  isConsentEligible,
  learningSettingsSchema,
  parseLearningResult,
  rankScore,
  segmentsToText,
} from '@vocaliq/shared';
import type { AgentsService } from '../agents/agents.service';
import type { PrismaService } from '../db/prisma.service';

/**
 * Agents that learn from top human reps (Day 89). A tenant's BEST consent-eligible calls become a
 * training signal: a metered LLM distills the winning patterns + proposes concrete persona
 * improvements a human reviews, applies, and validates with the Day-33 test suite before publishing.
 * Guarantees:
 *  - C (consent): the tenant must opt in, and ONLY calls that pass {@link isConsentEligible} (AI
 *    disclosed, caller not opted out, recording present) are ever used; the excluded count is recorded.
 *  - B (isolation): candidate calls + the agent are RLS-scoped (`db.withTenant`) — a tenant's calls only
 *    train its own agents.
 *  - D (cost): the analysis is one metered LLM call over at most {@link MAX_TRAINING_CALLS} transcripts.
 *  - A (validity): a suggestion is a proposal; applying it appends to the agent's system prompt (a
 *    reviewed change) which still requires re-testing + re-publishing.
 */

/** Metered LLM completion — tenant-scoped (the production impl routes through RouterService). */
export type LearningCompleter = (input: {
  tenantId: string;
  system: string;
  user: string;
}) => Promise<{ text: string; model: string }>;

interface StoredSuggestion {
  id: string;
  title: string;
  text: string;
  applied: boolean;
}

/** The stored view of a learning run (patterns + suggestions are opaque JSON to the caller). */
export interface LearningRunView {
  id: string;
  agentId: string;
  status: string;
  callsUsed: number;
  callsExcluded: number;
  patterns: unknown;
  suggestions: unknown;
  model: string | null;
  createdAt: Date;
}

const RUN_SELECT = {
  id: true,
  agentId: true,
  status: true,
  callsUsed: true,
  callsExcluded: true,
  patterns: true,
  suggestions: true,
  model: true,
  createdAt: true,
} as const;

export class LearningService {
  constructor(
    private readonly db: PrismaService,
    private readonly agents: AgentsService,
    private readonly analyst: LearningCompleter,
  ) {}

  // ── opt-in settings (tenant.settings) ───────────────────────────────────────────

  async getSettings(tenantId: string): Promise<LearningSettings> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const s = (t?.settings ?? {}) as { learnFromCalls?: boolean };
    return { enabled: s.learnFromCalls === true };
  }

  async setSettings(tenantId: string, input: unknown): Promise<LearningSettings> {
    const parsed = learningSettingsSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid settings');
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), learnFromCalls: parsed.data.enabled };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return parsed.data;
  }

  // ── analyze top calls ───────────────────────────────────────────────────────────

  /** Analyze an agent's top consent-eligible calls → winning patterns + persona suggestions (metered). */
  async analyze(tenantId: string, agentId: string): Promise<LearningRunView> {
    // C: the tenant must explicitly opt in to using recordings/transcripts as a training signal.
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled)
      throw new ValidationError('Enable "learn from calls" first (consent) to analyze recordings.');

    // B: the agent must belong to the tenant (RLS-scoped → NotFound otherwise).
    await this.agents.get(tenantId, agentId);

    const pool = await this.db.withTenant(tenantId, (tx) =>
      tx.call.findMany({
        where: { agentId },
        select: {
          id: true,
          disposition: true,
          sentiment: true,
          disclosedAt: true,
          humanOptOutAt: true,
          recordingUrl: true,
          qaScores: { select: { overall: true } },
          transcript: { select: { segments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );

    // Consent gate (self-audit C) — only eligible calls with a real transcript become a training signal.
    const withText = pool.map((c) => ({
      ...c,
      text: segmentsToText(c.transcript?.segments),
      qaScore: c.qaScores.length > 0 ? Math.max(...c.qaScores.map((q) => q.overall)) : null,
    }));
    const eligible = withText.filter((c) => c.text.length > 0 && isConsentEligible(c));
    const callsExcluded = withText.filter((c) => c.text.length > 0 && !isConsentEligible(c)).length;

    if (eligible.length === 0) {
      return this.db.withTenant(tenantId, (tx) =>
        tx.learningRun.create({
          data: { tenantId, agentId, status: 'empty', callsUsed: 0, callsExcluded },
          select: RUN_SELECT,
        }),
      );
    }

    // Rank by quality + keep only the very best (bounds cost — self-audit D).
    const top = eligible.sort((a, b) => rankScore(b) - rankScore(a)).slice(0, MAX_TRAINING_CALLS);
    const calls: AnalysisCall[] = top.map((c) => ({
      qaScore: c.qaScore,
      disposition: c.disposition,
      text: c.text,
    }));

    const { system, user } = buildAnalysisPrompt(calls);
    const { text, model } = await this.analyst({ tenantId, system, user });
    const result = parseLearningResult(text);
    const suggestions: StoredSuggestion[] = result.suggestions.map((s, i) => ({
      id: `s${i}`,
      title: s.title,
      text: s.text,
      applied: false,
    }));

    return this.db.withTenant(tenantId, (tx) =>
      tx.learningRun.create({
        data: {
          tenantId,
          agentId,
          status: result.patterns.length > 0 || suggestions.length > 0 ? 'ready' : 'empty',
          callsUsed: top.length,
          callsExcluded,
          patterns: result.patterns as object,
          suggestions: suggestions as object,
          model,
        },
        select: RUN_SELECT,
      }),
    );
  }

  async listRuns(tenantId: string, agentId: string): Promise<LearningRunView[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.learningRun.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: RUN_SELECT,
      }),
    );
  }

  async getRun(tenantId: string, runId: string): Promise<LearningRunView> {
    const run = await this.db.withTenant(tenantId, (tx) =>
      tx.learningRun.findFirst({ where: { id: runId }, select: RUN_SELECT }),
    );
    if (!run) throw new NotFoundError('Learning run not found');
    return run;
  }

  // ── apply a reviewed suggestion (self-audit A) ─────────────────────────────────

  /**
   * Apply one suggestion: append it to the agent's system prompt (a reviewed change) and mark it
   * applied. The improved agent must still be re-tested (Day 33) + re-published — this only stages it.
   */
  async applySuggestion(tenantId: string, runId: string, suggestionId: string) {
    const run = await this.db.withTenant(tenantId, (tx) =>
      tx.learningRun.findFirst({
        where: { id: runId },
        select: { id: true, agentId: true, suggestions: true },
      }),
    );
    if (!run) throw new NotFoundError('Learning run not found');
    const suggestions = (run.suggestions as unknown as StoredSuggestion[]) ?? [];
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) throw new NotFoundError('Suggestion not found');

    // Idempotent: re-applying an already-applied suggestion must NOT append the playbook line twice.
    if (suggestion.applied) return { applied: true, agentId: run.agentId, alreadyApplied: true };

    // Read the agent's current system prompt (RLS-scoped), append the reviewed playbook line.
    const agent = await this.db.withTenant(tenantId, (tx) =>
      tx.agent.findFirst({ where: { id: run.agentId }, select: { persona: true } }),
    );
    if (!agent) throw new NotFoundError('Agent not found');
    const current = (agent.persona as { systemPrompt?: string } | null)?.systemPrompt ?? '';
    const nextPrompt = appendPlaybook(current, suggestion.text);

    // Persist via the normal agent update (validated by the agent schema — self-audit A).
    await this.agents.update(tenantId, run.agentId, { systemPrompt: nextPrompt });

    // Mark this suggestion applied on the run.
    const nextSuggestions = suggestions.map((s) =>
      s.id === suggestionId ? { ...s, applied: true } : s,
    );
    await this.db.withTenant(tenantId, (tx) =>
      tx.learningRun.update({
        where: { id: runId },
        data: { suggestions: nextSuggestions as object },
      }),
    );
    return { applied: true, agentId: run.agentId, alreadyApplied: false };
  }
}
