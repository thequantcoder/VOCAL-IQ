import { z } from 'zod';
import { callbackNodeConfigSchema } from './callback.js';
import { FlowNodeType } from './enums.js';
import type { FlowNode } from './flow-graph.js';

/**
 * Per-node config schemas + runtime contribution for the five core nodes (Day 18):
 * Start, Say, Listen, Decision, End. Each node's `data.config` is validated against its
 * type's schema; `compileNode` turns a node into the runtime spec the compiler (Day 22)
 * and the voice loop consume. Captured variables carry a sound type (self-audit focus A).
 */

// ── Captured variables (Listen) ───────────────────────────────────────────────

export const VARIABLE_TYPES = [
  'text',
  'number',
  'date',
  'email',
  'phone',
  'boolean',
  'intent',
] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number];

export const capturedVariableSchema = z.object({
  // A valid identifier so it can be referenced as {{var}} downstream.
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be a valid variable name'),
  type: z.enum(VARIABLE_TYPES),
  required: z.boolean().default(false),
});
export type CapturedVariable = z.infer<typeof capturedVariableSchema>;

// ── Per-type config schemas ───────────────────────────────────────────────────

export const startConfigSchema = z.object({
  openingLine: z.string().max(1000).default(''),
  language: z.string().max(10).default('en'),
  voiceId: z.string().uuid().nullish(),
  // Multilingual (Day 25): auto-detect the caller's language mid-call + pronunciation fixes.
  autoDetectLanguage: z.boolean().default(false),
  pronunciations: z
    .array(z.object({ term: z.string().min(1).max(80), say: z.string().min(1).max(120) }))
    .max(100)
    .default([]),
});

export const sayConfigSchema = z
  .object({
    mode: z.enum(['scripted', 'generated']).default('scripted'),
    text: z.string().max(2000).default(''),
    prompt: z.string().max(2000).default(''),
    // Per-node model/voice swap (Day 27): cheap model for routing, premium for high-stakes.
    modelOverride: z.string().max(80).default(''),
    voiceOverride: z.string().max(80).default(''),
  })
  .refine((c) => (c.mode === 'scripted' ? c.text.length > 0 : c.prompt.length > 0), {
    message: 'Scripted needs text; generated needs a prompt',
  });

/**
 * Squad-handoff node (Day 27): pass the live call to another specialist in the squad when
 * `on` (the classified signal) fires. The shared context bus travels with the handoff so
 * the receiving agent doesn't re-ask; `note` is optional spoken/internal context.
 */
export const squadHandoffConfigSchema = z.object({
  on: z.string().min(1).max(60).default('handoff'), // signal that triggers the handoff
  toRole: z.string().max(60).default(''), // target specialist role (resolved to an agent at runtime)
  note: z.string().max(500).default(''),
});
export type SquadHandoffConfig = z.infer<typeof squadHandoffConfigSchema>;

export const listenConfigSchema = z.object({
  captures: z.array(capturedVariableSchema).default([]),
  timeoutMs: z.number().int().min(500).max(30_000).default(5000),
});

export const decisionBranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  kind: z.enum(['intent', 'sentiment', 'value', 'else']),
  match: z.string().max(300).default(''),
});

export const decisionConfigSchema = z.object({
  branches: z.array(decisionBranchSchema).default([]),
});

export const endConfigSchema = z.object({
  outcome: z.string().max(80).default(''),
  hangup: z.boolean().default(true),
});

/**
 * Tool node (Day 19). `function` = a typed function the LLM may call mid-call; `webhook`
 * = a fire-and-forget signed REST call. `params` is the JSON-schema `properties` map the
 * executor validates LLM args against. Endpoints are SSRF-guarded at execution time.
 */
export const toolParamSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be a valid parameter name'),
  type: z.enum(['string', 'number', 'integer', 'boolean', 'object', 'array']),
  required: z.boolean().default(false),
});

export const toolConfigSchema = z.object({
  kind: z.enum(['function', 'webhook']).default('function'),
  name: z
    .string()
    .max(60)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'must be a valid tool name')
    .or(z.literal(''))
    .default(''),
  description: z.string().max(500).default(''),
  endpoint: z.string().url('must be a valid URL').or(z.literal('')).default(''),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  params: z.array(toolParamSchema).default([]),
  authHeader: z.string().max(200).default(''),
  signPayload: z.boolean().default(false),
});
export type ToolParam = z.infer<typeof toolParamSchema>;
export type ToolConfig = z.infer<typeof toolConfigSchema>;

/** Knowledge node (Day 20): retrieve top-k chunks from a tenant KB and ground the reply. */
export const knowledgeConfigSchema = z.object({
  kbId: z.string().uuid().or(z.literal('')).default(''),
  topK: z.number().int().min(1).max(20).default(4),
  attribution: z.boolean().default(false),
});
export type KnowledgeConfig = z.infer<typeof knowledgeConfigSchema>;

// ── Day 21 nodes: Collect&Confirm, Transfer, Sub-flow ─────────────────────────

/** Read back captured fields and confirm/correct before acting. */
export const collectConfirmConfigSchema = z.object({
  fields: z.array(z.string().min(1).max(60)).default([]), // captured variable names to confirm
  confirmPrompt: z.string().max(500).default(''),
  maxRetries: z.number().int().min(0).max(5).default(2),
});
export type CollectConfirmConfig = z.infer<typeof collectConfirmConfigSchema>;

/** Hand the call to a human or another agent (warm = spoken context first). */
export const transferConfigSchema = z.object({
  target: z.enum(['human', 'agent', 'number']).default('human'),
  destination: z.string().max(200).default(''), // E.164 number / agentId / queue name
  mode: z.enum(['warm', 'cold']).default('warm'),
  summarizeContext: z.boolean().default(true),
});
export type TransferConfig = z.infer<typeof transferConfigSchema>;

/** Invoke another flow as a reusable component, then continue. */
export const subflowConfigSchema = z.object({
  flowId: z.string().uuid().or(z.literal('')).default(''),
  returnLabel: z.string().max(80).default(''),
});
export type SubflowConfig = z.infer<typeof subflowConfigSchema>;

/**
 * Payment node (Day 78 — PCI-safe pay-by-voice). Takes a card payment mid-call. The card details
 * are captured by a PCI-compliant provider (never by VocalIQ), so the amount/currency/description
 * here are all this node ever holds — no card fields exist. `amountSource` is either a fixed amount
 * (minor units) or a captured variable (a major-unit number the caller/flow provided).
 */
export const paymentConfigSchema = z
  .object({
    amountSource: z.enum(['fixed', 'variable']).default('fixed'),
    amountCents: z.number().int().nonnegative().max(100_000_00).default(0),
    amountVariable: z.string().max(60).default(''), // captured variable holding the amount
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .default('USD'),
    description: z.string().max(200).default(''),
    confirmBeforeCharge: z.boolean().default(true),
    receiptChannel: z.enum(['none', 'email', 'sms']).default('none'),
    receiptTo: z.string().max(160).default(''), // literal or {{variable}}
  })
  .refine((c) => (c.amountSource === 'fixed' ? c.amountCents > 0 : c.amountVariable.length > 0), {
    message: 'Fixed needs an amount; variable needs a variable name',
  });
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;

/**
 * Runtime helper: the spoken confirmation for the captured fields (Collect&Confirm). Only
 * fields that were actually captured are read back.
 */
export function buildConfirmation(
  fields: string[],
  captured: Record<string, unknown>,
  prompt = '',
): string {
  const parts = fields
    .filter((f) => captured[f] !== undefined && captured[f] !== null && captured[f] !== '')
    .map((f) => `${f.replace(/_/g, ' ')} as ${String(captured[f])}`);
  if (parts.length === 0) return prompt || 'I don’t have anything to confirm yet.';
  const lead = prompt ? `${prompt} ` : '';
  return `${lead}I have your ${parts.join(', ')}. Is that correct?`;
}

/**
 * Runtime helper: the handoff context passed to a transfer target. Carries only the
 * current call's captured data — it is assembled per-call inside the tenant's loop, so it
 * can never include another tenant's data (self-audit B).
 */
export function buildTransferContext(
  captured: Record<string, unknown>,
  note = '',
): { summary: string; data: Record<string, unknown> } {
  const entries = Object.entries(captured).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  const facts = entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`).join('; ');
  const summary = [note, facts].filter(Boolean).join(' — ') || 'No context captured yet.';
  return { summary, data: Object.fromEntries(entries) };
}

/** Build the JSON-schema `{ properties, required }` the executor validates args against. */
export function toolParamsToJsonSchema(params: ToolParam[]): {
  properties: Record<string, { type: string }>;
  required: string[];
} {
  const properties: Record<string, { type: string }> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = { type: p.type };
    if (p.required) required.push(p.name);
  }
  return { properties, required };
}

export type StartConfig = z.infer<typeof startConfigSchema>;
export type SayConfig = z.infer<typeof sayConfigSchema>;
export type ListenConfig = z.infer<typeof listenConfigSchema>;
export type DecisionConfig = z.infer<typeof decisionConfigSchema>;
export type EndConfig = z.infer<typeof endConfigSchema>;

const CONFIG_SCHEMAS = {
  [FlowNodeType.START]: startConfigSchema,
  [FlowNodeType.SAY]: sayConfigSchema,
  [FlowNodeType.LISTEN]: listenConfigSchema,
  [FlowNodeType.DECISION]: decisionConfigSchema,
  [FlowNodeType.END]: endConfigSchema,
  [FlowNodeType.TOOL]: toolConfigSchema,
  [FlowNodeType.KNOWLEDGE]: knowledgeConfigSchema,
  [FlowNodeType.COLLECT_CONFIRM]: collectConfirmConfigSchema,
  [FlowNodeType.TRANSFER]: transferConfigSchema,
  [FlowNodeType.SUBFLOW]: subflowConfigSchema,
  [FlowNodeType.SQUAD_HANDOFF]: squadHandoffConfigSchema,
  [FlowNodeType.PAYMENT]: paymentConfigSchema,
  [FlowNodeType.CALLBACK]: callbackNodeConfigSchema,
} as const;

/** The config schema for a node type, or null if the type has no config schema yet. */
export function nodeConfigSchema(type: string): z.ZodTypeAny | null {
  return (CONFIG_SCHEMAS as Record<string, z.ZodTypeAny>)[type] ?? null;
}

export interface NodeConfigError {
  path: string;
  message: string;
}

/** Validate a node's config against its type. Types with no schema pass (config is opaque). */
export function validateNodeConfig(
  type: string,
  config: unknown,
): { valid: boolean; errors: NodeConfigError[] } {
  const schema = nodeConfigSchema(type);
  if (!schema) return { valid: true, errors: [] };

  const parsed = schema.safeParse(config ?? {});
  const errors: NodeConfigError[] = parsed.success
    ? []
    : parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

  // Extra invariant: Listen capture names must be unique (sound variable typing).
  if (type === FlowNodeType.LISTEN) {
    const captures = (config as { captures?: { name?: string }[] } | null)?.captures ?? [];
    const seen = new Set<string>();
    for (const c of captures) {
      const name = c?.name ?? '';
      if (name && seen.has(name)) {
        errors.push({ path: 'captures', message: `Duplicate capture "${name}"` });
      }
      seen.add(name);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Runtime contribution (for the compiler, Day 22) ───────────────────────────

export interface NodeSpec {
  id: string;
  type: string;
  config: Record<string, unknown>;
  /** Typed variables this node captures (Listen); empty otherwise. */
  captures: CapturedVariable[];
}

/** Compile a node into its runtime spec — parsed config + declared captures. */
export function compileNode(node: FlowNode): NodeSpec {
  const schema = nodeConfigSchema(node.type);
  const raw = node.data?.config ?? {};
  const config = schema ? (schema.safeParse(raw).data ?? {}) : raw;
  const captures =
    node.type === FlowNodeType.LISTEN ? ((config as ListenConfig).captures ?? []) : [];
  return { id: node.id, type: node.type, config: config as Record<string, unknown>, captures };
}
