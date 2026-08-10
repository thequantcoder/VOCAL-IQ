import type { PrismaClient } from '@vocaliq/db';
import { Router, type UsageMeter } from '@vocaliq/provider-router';
import {
  type AgentMemoryData,
  Capability,
  type MemoryFact,
  Provider,
  ProviderError,
  buildMemoryExtractionPrompt,
  mergeMemoryFacts,
  parseMemoryExtraction,
  segmentsToText,
} from '@vocaliq/shared';

/**
 * Cross-call memory extraction worker (Day 34). On call-end, if the agent has memory ON,
 * distil durable caller facts from the transcript via a METERED LLM (self-audit D) and merge
 * them into the (tenant, agent, contact) AgentMemory (self-audit B). The pure runner is
 * unit-tested with injected deps; disabled agents + empty transcripts never call the LLM.
 */

export interface MemoryJob {
  tenantId: string;
  agentId: string;
  contactId: string;
  transcriptId: string;
  lastCallId?: string;
}

export interface MemoryDeps {
  isMemoryEnabled(agentId: string): Promise<boolean>;
  fetchTranscriptText(transcriptId: string): Promise<string | null>;
  /** Metered LLM extraction → validated memory. */
  extract(tenantId: string, transcriptText: string): Promise<AgentMemoryData>;
  saveMemory(job: MemoryJob, data: AgentMemoryData): Promise<void>;
  log(message: string): void;
}

export type MemoryResult =
  | { status: 'disabled' | 'not_found' | 'empty' }
  | { status: 'ok'; facts: number };

export async function runMemoryExtraction(deps: MemoryDeps, job: MemoryJob): Promise<MemoryResult> {
  if (!(await deps.isMemoryEnabled(job.agentId))) return { status: 'disabled' };
  const text = await deps.fetchTranscriptText(job.transcriptId);
  if (text === null) return { status: 'not_found' };
  if (!text) return { status: 'empty' };

  const data = await deps.extract(job.tenantId, text);
  await deps.saveMemory(job, data);
  deps.log(`[memory ${job.contactId}] +${data.facts.length} facts`);
  return { status: 'ok', facts: data.facts.length };
}

const PLATFORM_ENV: Partial<Record<Provider, string>> = {
  [Provider.OPENAI]: 'OPENAI_API_KEY',
  [Provider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
};

/** Production deps (admin client — workers span tenants for this infra path). */
export function createDbMemoryDeps(admin: PrismaClient, log: (m: string) => void): MemoryDeps {
  return {
    isMemoryEnabled: async (agentId) => {
      const a = await admin.agent.findUnique({
        where: { id: agentId },
        select: { memoryEnabled: true },
      });
      return a?.memoryEnabled ?? false;
    },
    fetchTranscriptText: async (transcriptId) => {
      const t = await admin.transcript.findUnique({
        where: { id: transcriptId },
        select: { segments: true },
      });
      return t ? segmentsToText(t.segments) : null;
    },
    extract: async (tenantId, text) => {
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
        resolveKey: async (_t, provider) => {
          const envVar = PLATFORM_ENV[provider];
          const key = envVar ? process.env[envVar] : undefined;
          if (!key) throw new ProviderError(`No platform key configured for ${provider}`);
          return { apiKey: key, byok: false };
        },
        meter,
      });
      const { system, user } = buildMemoryExtractionPrompt(text);
      const llm = router.selectLLM({ tenantId, capability: Capability.LLM });
      const result = await llm.complete([{ role: 'user', content: user }], { system });
      return parseMemoryExtraction(result.text);
    },
    saveMemory: async (job, data) => {
      const existing = await admin.agentMemory.findFirst({
        where: { agentId: job.agentId, contactId: job.contactId },
        select: { facts: true },
      });
      const facts = mergeMemoryFacts((existing?.facts as MemoryFact[]) ?? [], data.facts);
      await admin.agentMemory.upsert({
        where: {
          tenantId_agentId_contactId: {
            tenantId: job.tenantId,
            agentId: job.agentId,
            contactId: job.contactId,
          },
        },
        create: {
          tenantId: job.tenantId,
          agentId: job.agentId,
          contactId: job.contactId,
          summary: data.summary,
          facts,
          ...(job.lastCallId ? { lastCallId: job.lastCallId } : {}),
        },
        update: {
          summary: data.summary,
          facts,
          ...(job.lastCallId ? { lastCallId: job.lastCallId } : {}),
        },
      });
    },
    log,
  };
}
