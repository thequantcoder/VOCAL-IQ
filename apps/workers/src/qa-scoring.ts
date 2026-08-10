import type { PrismaClient } from '@vocaliq/db';
import { Router, type UsageMeter } from '@vocaliq/provider-router';
import {
  Capability,
  Provider,
  ProviderError,
  type QaCriterion,
  type QaScored,
  buildQaPrompt,
  parseQaResult,
  scoreQa,
  segmentsToText,
  shouldSample,
} from '@vocaliq/shared';

/**
 * Automated QA scoring worker (Day 43). When a call ends, evaluate its transcript against
 * every ACTIVE rubric for the tenant (optionally agent-scoped) using a METERED LLM call
 * (golden rule #4 — every completion records a tenant-scoped UsageRecord), then persist a
 * QaScore per rubric. Cost-aware: a rubric's `samplingRate` deterministically decides which
 * calls it scores, so an empty transcript or a sampled-out rubric never spends. The pure
 * `runQaScoring` orchestrates fetch → sample → prompt → parse → score → save with injected
 * deps, so it is unit-tested without a live LLM (self-audit A + D).
 */

export interface QaRubricRow {
  id: string;
  name: string;
  criteria: QaCriterion[];
  samplingRate: number;
}

export interface QaCall {
  tenantId: string;
  agentId: string;
  segments: unknown;
}

export interface QaSaved extends QaScored {
  rubricId: string;
  model: string;
}

export interface QaDeps {
  /** The call + its transcript segments, or null if missing/no transcript. */
  fetchCall(callId: string): Promise<QaCall | null>;
  /** Active rubrics that apply to this call's agent (agent-scoped OR global). */
  fetchRubrics(tenantId: string, agentId: string): Promise<QaRubricRow[]>;
  /** Metered LLM completion — returns { text, model }. */
  complete(input: {
    tenantId: string;
    system: string;
    user: string;
  }): Promise<{ text: string; model: string }>;
  saveScore(callId: string, score: QaSaved): Promise<void>;
  log(message: string): void;
}

export type QaResult =
  | { status: 'not_found' | 'empty' | 'no_rubrics' }
  | { status: 'ok'; scored: number; sampledOut: number };

export async function runQaScoring(deps: QaDeps, callId: string): Promise<QaResult> {
  const call = await deps.fetchCall(callId);
  if (!call) return { status: 'not_found' };

  const text = segmentsToText(call.segments);
  if (!text) {
    deps.log(`[qa ${callId}] empty transcript — skipped`);
    return { status: 'empty' };
  }

  const rubrics = await deps.fetchRubrics(call.tenantId, call.agentId);
  if (rubrics.length === 0) return { status: 'no_rubrics' };

  let scored = 0;
  let sampledOut = 0;
  for (const rubric of rubrics) {
    // Cost-aware: skip (no LLM spend) when this call isn't in the rubric's sample.
    if (!shouldSample(rubric.samplingRate, `${callId}:${rubric.id}`)) {
      sampledOut++;
      continue;
    }
    if (rubric.criteria.length === 0) continue;

    const { system, user } = buildQaPrompt(rubric.criteria, text);
    const { text: raw, model } = await deps.complete({ tenantId: call.tenantId, system, user });
    const parsed = parseQaResult(raw, rubric.criteria);
    const result = scoreQa(parsed);
    await deps.saveScore(callId, { ...result, rubricId: rubric.id, model });
    scored++;
  }

  deps.log(`[qa ${callId}] scored ${scored} rubric(s), ${sampledOut} sampled out`);
  return { status: 'ok', scored, sampledOut };
}

/** Managed-mode key resolver: platform keys from env (BYOK-in-worker is a later refinement). */
const PLATFORM_ENV: Partial<Record<Provider, string>> = {
  [Provider.OPENAI]: 'OPENAI_API_KEY',
  [Provider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
};

/**
 * Production deps backed by the admin client (workers span tenants for this infra path).
 * `complete` routes through the provider Router with a meter that writes a tenant-scoped
 * UsageRecord — so there is no un-metered LLM path (self-audit D).
 */
export function createDbQaDeps(admin: PrismaClient, log: (m: string) => void): QaDeps {
  return {
    fetchCall: async (callId) => {
      const call = await admin.call.findUnique({
        where: { id: callId },
        select: { tenantId: true, agentId: true, transcript: { select: { segments: true } } },
      });
      if (!call?.transcript) return null;
      return { tenantId: call.tenantId, agentId: call.agentId, segments: call.transcript.segments };
    },
    fetchRubrics: async (tenantId, agentId) => {
      const rows = await admin.qaRubric.findMany({
        where: { tenantId, active: true, OR: [{ agentId: null }, { agentId }] },
        select: { id: true, name: true, criteria: true, samplingRate: true },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        criteria: (Array.isArray(r.criteria) ? r.criteria : []) as QaCriterion[],
        samplingRate: r.samplingRate,
      }));
    },
    complete: async ({ tenantId, system, user }) => {
      const meter: UsageMeter = async (rec) => {
        await admin.usageRecord.create({
          data: {
            tenantId,
            provider: rec.provider,
            capability: Capability.LLM,
            units: rec.units,
            costUsd: rec.costUsd,
            byok: rec.byok,
          },
        });
      };
      const router = new Router({
        resolveKey: async (_tenantId, provider) => {
          const envVar = PLATFORM_ENV[provider];
          const key = envVar ? process.env[envVar] : undefined;
          if (!key) throw new ProviderError(`No platform key configured for ${provider}`);
          return { apiKey: key, byok: false };
        },
        meter,
      });
      const llm = router.selectLLM({ tenantId, capability: Capability.LLM });
      const result = await llm.complete([{ role: 'user', content: user }], { system });
      return { text: result.text, model: result.model };
    },
    saveScore: async (callId, score) => {
      const call = await admin.call.findUnique({
        where: { id: callId },
        select: { tenantId: true },
      });
      if (!call) return;
      await admin.qaScore.upsert({
        where: { callId_rubricId: { callId, rubricId: score.rubricId } },
        create: {
          tenantId: call.tenantId,
          callId,
          rubricId: score.rubricId,
          overall: score.overall,
          criteria: score.criteria as unknown as object,
          model: score.model,
        },
        update: {
          overall: score.overall,
          criteria: score.criteria as unknown as object,
          model: score.model,
        },
      });
    },
    log,
  };
}
