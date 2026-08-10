import { z } from 'zod';

/**
 * Agent persona (Day 24) — the structured system-prompt studio. Stored in Agent.persona.
 * `buildSystemPrompt` composes the runtime system prompt (unless an explicit override is
 * set); `lintPersona` + `estimateTokens`/`estimateCostUsd` power the studio's warnings +
 * token/cost preview.
 */

export const personaSchema = z.object({
  role: z.string().max(200).default(''),
  tone: z.string().max(200).default(''),
  instructions: z.string().max(4000).default(''),
  guardrails: z.array(z.string().min(1).max(300)).max(30).default([]),
  bannedWords: z.array(z.string().min(1).max(60)).max(100).default([]),
  /** If set, used verbatim as the system prompt (studio "advanced" mode). */
  systemPrompt: z.string().max(8000).optional(),
});
export type Persona = z.infer<typeof personaSchema>;

/** Compose the runtime system prompt from the structured persona (or the override). */
export function buildSystemPrompt(p: Persona): string {
  if (p.systemPrompt?.trim()) return p.systemPrompt.trim();
  const parts: string[] = [];
  if (p.role) parts.push(`You are ${p.role}.`);
  if (p.tone) parts.push(`Speak in a ${p.tone} tone.`);
  if (p.instructions) parts.push(p.instructions.trim());
  if (p.guardrails.length) parts.push(`Rules:\n${p.guardrails.map((g) => `- ${g}`).join('\n')}`);
  if (p.bannedWords.length) parts.push(`Never say: ${p.bannedWords.join(', ')}.`);
  return parts.join('\n\n');
}

/** Rough token estimate (~4 chars/token) for the studio preview. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Rough per-turn LLM input cost (USD) at gpt-4o-mini input rate ($0.15/1M). */
export function estimateCostUsd(tokens: number, ratePerMillion = 0.15): number {
  return Math.round((tokens * ratePerMillion) / 1_000_000 / 1e-6) * 1e-6;
}

export interface PersonaLint {
  warnings: string[];
  tokens: number;
}

/** Warn about common prompt problems (self-audit focus: guardrails/banned words sound). */
export function lintPersona(p: Persona): PersonaLint {
  const prompt = buildSystemPrompt(p);
  const tokens = estimateTokens(prompt);
  const warnings: string[] = [];

  if (!p.role && !p.systemPrompt) warnings.push('No role defined — the agent may sound generic.');
  if (tokens > 1500)
    warnings.push('Prompt is long (>~1500 tokens) — expect higher latency + cost.');
  if (!p.guardrails.length && !p.systemPrompt)
    warnings.push('No guardrails set — consider adding limits.');

  const lowerInstr = p.instructions.toLowerCase();
  for (const w of p.bannedWords) {
    if (w && lowerInstr.includes(w.toLowerCase())) {
      warnings.push(`Banned word "${w}" also appears in the instructions.`);
    }
  }
  return { warnings, tokens };
}
