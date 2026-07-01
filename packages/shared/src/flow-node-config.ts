import { z } from 'zod';
import { FlowNodeType } from './enums';
import type { FlowNode } from './flow-graph';

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
});

export const sayConfigSchema = z
  .object({
    mode: z.enum(['scripted', 'generated']).default('scripted'),
    text: z.string().max(2000).default(''),
    prompt: z.string().max(2000).default(''),
  })
  .refine((c) => (c.mode === 'scripted' ? c.text.length > 0 : c.prompt.length > 0), {
    message: 'Scripted needs text; generated needs a prompt',
  });

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
