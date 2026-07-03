import { z } from 'zod';

/**
 * Cross-call Agent Memory (Day 34). Durable, per-(tenant, agent, contact) facts so a
 * returning caller is remembered (preferences, budget, objections, last outcome). These
 * pure helpers merge new facts, build the system-prompt snippet injected at call start, and
 * decide retention — kept pure so scoping/retention (self-audit B + C) are unit-tested. The
 * store is RLS-scoped in the API; extraction (LLM) is metered in the worker.
 */

export const MEMORY_KINDS = ['preference', 'budget', 'objection', 'outcome', 'detail'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const memoryFactSchema = z.object({
  key: z.string().min(1).max(60),
  value: z.string().min(1).max(300),
  kind: z.enum(MEMORY_KINDS).default('detail'),
});
export type MemoryFact = z.infer<typeof memoryFactSchema>;

export const agentMemorySchema = z.object({
  summary: z.string().max(1000).default(''),
  facts: z.array(memoryFactSchema).max(50).default([]),
});
export type AgentMemoryData = z.infer<typeof agentMemorySchema>;

const MAX_FACTS = 50;

/**
 * Merge newly-extracted facts into the existing set: same `key` (case-insensitive) is
 * overwritten with the newer fact, others are kept, and the set is capped (newest-wins).
 * Deterministic so repeated calls converge rather than grow unbounded.
 */
export function mergeMemoryFacts(existing: MemoryFact[], incoming: MemoryFact[]): MemoryFact[] {
  const byKey = new Map<string, MemoryFact>();
  for (const f of existing) byKey.set(f.key.toLowerCase(), f);
  for (const f of incoming) byKey.set(f.key.toLowerCase(), f); // newest wins
  return [...byKey.values()].slice(-MAX_FACTS);
}

/**
 * Build the memory snippet injected into the agent's system prompt at call start. Returns
 * '' when there's nothing to remember (so a first-time caller gets no phantom context).
 * The receiving agent is told these are notes from prior calls with THIS caller.
 */
export function buildMemoryContext(memory: { summary?: string; facts: MemoryFact[] }): string {
  const parts: string[] = [];
  if (memory.summary?.trim()) parts.push(memory.summary.trim());
  if (memory.facts.length > 0) {
    const facts = memory.facts.map((f) => `- ${f.key}: ${f.value}`).join('\n');
    parts.push(`Known about this returning caller:\n${facts}`);
  }
  if (parts.length === 0) return '';
  return `Context from previous calls with this caller (use it naturally, don't recite it):\n${parts.join('\n')}`;
}

/**
 * Retention: a memory is expired when older than `retentionDays`. `retentionDays <= 0`
 * means keep forever (the default policy). Contact-level erase is a separate, always-on
 * GDPR path (handled in the API), independent of retention.
 */
export function isMemoryExpired(updatedAt: Date, retentionDays: number, now: Date): boolean {
  if (retentionDays <= 0) return false;
  const ageMs = now.getTime() - updatedAt.getTime();
  return ageMs > retentionDays * 24 * 60 * 60 * 1000;
}

// ── Extraction (worker: LLM distils durable facts from a transcript) ─────────────

/** Build the prompt asking the model to distil durable, caller-specific memory as JSON. */
export function buildMemoryExtractionPrompt(transcriptText: string): {
  system: string;
  user: string;
} {
  const system =
    'You extract DURABLE facts worth remembering about a caller for future calls (preferences, ' +
    'budget, objections, the outcome). Ignore one-off pleasantries. Reply with ONLY JSON: ' +
    '{"summary": string (<=2 sentences), "facts": {"key": string, "value": string, ' +
    '"kind": "preference"|"budget"|"objection"|"outcome"|"detail"}[]}. Empty facts if nothing durable.';
  return { system, user: `Transcript:\n${transcriptText.slice(0, 12_000)}` };
}

/**
 * Parse the model's extraction into validated memory. Tolerates fences/prose; on any failure
 * returns empty memory (never throws) so a bad generation can't corrupt a caller's memory.
 */
export function parseMemoryExtraction(raw: string): AgentMemoryData {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return agentMemorySchema.parse({});
  try {
    const parsed = agentMemorySchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : agentMemorySchema.parse({});
  } catch {
    return agentMemorySchema.parse({});
  }
}
