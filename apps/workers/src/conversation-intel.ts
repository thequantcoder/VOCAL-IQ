import type { PrismaClient } from '@vocaliq/db';
import { type DetectedSignal, extractSignals, segmentsToText } from '@vocaliq/shared';

/**
 * Conversation-intelligence worker (Day 75). On call-end, mine the transcript for objections,
 * buying signals, competitor mentions, feature requests, and churn risk — then persist them as
 * `CallSignal` rows for the trend dashboards + alerts. Extraction is DETERMINISTIC: it reuses the
 * transcript the post-call worker already produced and makes NO LLM call, so conversation
 * intelligence adds zero per-call spend (self-audit D). Re-running replaces (idempotent). The pure
 * `runConversationIntel` orchestrates fetch → extract → save with injected deps, so its accuracy is
 * unit-tested without a database (self-audit A).
 */

export interface ConvoIntelContext {
  tenantId: string;
  text: string;
  competitors: string[];
}

export interface ConvoIntelDeps {
  fetchContext(callId: string): Promise<ConvoIntelContext | null>;
  saveSignals(tenantId: string, callId: string, signals: DetectedSignal[]): Promise<void>;
  log(message: string): void;
}

export type ConvoIntelResult =
  | { status: 'not_found' | 'empty' }
  | { status: 'ok'; signals: number };

export async function runConversationIntel(
  deps: ConvoIntelDeps,
  callId: string,
): Promise<ConvoIntelResult> {
  const ctx = await deps.fetchContext(callId);
  if (!ctx) return { status: 'not_found' };
  if (!ctx.text) {
    deps.log(`[convo-intel ${callId}] empty transcript — skipped`);
    return { status: 'empty' };
  }

  const signals = extractSignals(ctx.text, ctx.competitors);
  await deps.saveSignals(ctx.tenantId, callId, signals);
  deps.log(`[convo-intel ${callId}] ${signals.length} signals mined`);
  return { status: 'ok', signals: signals.length };
}

/**
 * Production deps backed by the admin client (workers span tenants for this infra path). No LLM is
 * used; the transcript text + the tenant's competitor watchlist drive deterministic extraction.
 */
export function createDbConvoIntelDeps(
  admin: PrismaClient,
  log: (m: string) => void,
): ConvoIntelDeps {
  return {
    fetchContext: async (callId) => {
      const t = await admin.transcript.findUnique({
        where: { callId },
        select: { tenantId: true, searchText: true, segments: true },
      });
      if (!t) return null;
      const cfg = await admin.conversationIntelConfig.findUnique({
        where: { tenantId: t.tenantId },
        select: { competitors: true },
      });
      return {
        tenantId: t.tenantId,
        text: t.searchText ?? segmentsToText(t.segments ?? []),
        competitors: cfg?.competitors ?? [],
      };
    },
    saveSignals: async (tenantId, callId, signals) => {
      await admin.callSignal.deleteMany({ where: { callId } });
      if (signals.length > 0) {
        await admin.callSignal.createMany({
          data: signals.map((s) => ({
            tenantId,
            callId,
            type: s.type,
            label: s.label,
            quote: s.quote ?? null,
          })),
        });
      }
    },
    log,
  };
}
