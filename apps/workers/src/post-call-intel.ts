import type { PrismaClient } from '@vocaliq/db';
import { Router, type UsageMeter } from '@vocaliq/provider-router';
import {
  Capability,
  type PostCallIntel,
  Provider,
  ProviderError,
  type TranscriptSegment,
  buildIntelPrompt,
  cleanSegments,
  parseIntel,
  segmentsToText,
} from '@vocaliq/shared';

/**
 * Post-call intelligence worker (Day 31). When a call ends, summarise its transcript and
 * extract keywords/topics/entities/sentiment via a METERED LLM call (golden rule #4 — every
 * completion records a tenant-scoped UsageRecord), then persist onto the Transcript. The
 * pure `runPostCallIntel` orchestrates fetch → prompt → parse → save with injected deps, so
 * it is unit-tested without a live LLM (self-audit A + D). An empty transcript never calls
 * the LLM (no wasted spend).
 */

export interface IntelTranscript {
  tenantId: string;
  segments: unknown;
}

export interface PostCallDeps {
  fetchTranscript(transcriptId: string): Promise<IntelTranscript | null>;
  /** Metered LLM completion — returns the raw model text. */
  complete(input: { tenantId: string; system: string; user: string }): Promise<string>;
  saveIntel(transcriptId: string, intel: PostCallIntel): Promise<void>;
  log(message: string): void;
}

export type IntelResult =
  | { status: 'not_found' | 'empty' }
  | { status: 'ok'; keywords: number; topics: number };

export async function runPostCallIntel(
  deps: PostCallDeps,
  transcriptId: string,
): Promise<IntelResult> {
  const t = await deps.fetchTranscript(transcriptId);
  if (!t) return { status: 'not_found' };

  const text = segmentsToText(t.segments);
  if (!text) {
    deps.log(`[post-call ${transcriptId}] empty transcript — skipped`);
    return { status: 'empty' };
  }

  const { system, user } = buildIntelPrompt(text);
  const raw = await deps.complete({ tenantId: t.tenantId, system, user });
  const intel = parseIntel(raw);
  await deps.saveIntel(transcriptId, intel);

  deps.log(
    `[post-call ${transcriptId}] ${intel.keywords.length} keywords, ${intel.topics.length} topics`,
  );
  return { status: 'ok', keywords: intel.keywords.length, topics: intel.topics.length };
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
export function createDbPostCallDeps(admin: PrismaClient, log: (m: string) => void): PostCallDeps {
  return {
    fetchTranscript: async (transcriptId) => {
      const t = await admin.transcript.findUnique({
        where: { id: transcriptId },
        select: { tenantId: true, segments: true },
      });
      return t ? { tenantId: t.tenantId, segments: t.segments } : null;
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
      return result.text;
    },
    saveIntel: async (transcriptId, intel) => {
      await admin.transcript.update({
        where: { id: transcriptId },
        data: {
          summary: intel.summary,
          keywords: intel.keywords,
          topics: intel.topics,
          entities: intel.entities,
          sentiment: intel.sentiment,
          intelAt: new Date(),
        },
      });
      // No-verbatim mode (Day 39): store a filler-stripped clean copy when the agent asks
      // for it. The raw `segments` are always kept; cleaning is the same tested pure fn.
      const t = await admin.transcript.findUnique({
        where: { id: transcriptId },
        select: { segments: true, call: { select: { agent: { select: { noVerbatim: true } } } } },
      });
      if (t?.call?.agent?.noVerbatim) {
        const raw = Array.isArray(t.segments) ? (t.segments as TranscriptSegment[]) : [];
        await admin.transcript.update({
          where: { id: transcriptId },
          data: { cleanSegments: cleanSegments(raw) as unknown as object },
        });
      }
    },
    log,
  };
}
