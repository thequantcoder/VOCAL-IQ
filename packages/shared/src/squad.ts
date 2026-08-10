import { z } from 'zod';

/**
 * Multi-agent Squads (Day 27). A squad chains specialist agents inside ONE live call
 * (receptionist → booking → billing). Two problems this module solves, as pure/tested
 * units the voice loop consumes:
 *
 *  1. **Handoff routing** — given the active agent + a signal (intent/keyword), which
 *     specialist takes the next turn? (`resolveHandoff`)
 *  2. **Shared context bus** — a per-call state that travels across every handoff so the
 *     next specialist never re-asks what the caller already gave. (`ContextBus`)
 *
 * The bus is created per call inside the tenant's loop, so it can only ever hold that
 * one call's data — there is no cross-tenant path (self-audit B). Per-node model/voice
 * overrides let a squad run a cheap model for routing and a premium one for high-stakes
 * turns; the router honours the resolved override + meters against it (self-audit D).
 */

// ── Squad config ──────────────────────────────────────────────────────────────

export const squadMemberSchema = z.object({
  agentId: z.string().uuid(),
  role: z.string().min(1).max(60), // receptionist / booking / billing …
  order: z.number().int().min(0).max(100).default(0),
});
export type SquadMember = z.infer<typeof squadMemberSchema>;

/**
 * A handoff rule: when `fromAgentId` is active and the turn yields signal `on`, pass the
 * call to `toAgentId`. `on` is a free label matched against the classified intent/keyword
 * ('booking', 'billing', 'human', …). First matching rule wins (declaration order).
 */
export const handoffRuleSchema = z.object({
  fromAgentId: z.string().uuid(),
  on: z.string().min(1).max(60),
  toAgentId: z.string().uuid(),
});
export type HandoffRule = z.infer<typeof handoffRuleSchema>;

export const squadConfigSchema = z
  .object({
    entryAgentId: z.string().uuid().nullish(),
    members: z.array(squadMemberSchema).max(20).default([]),
    handoffRules: z.array(handoffRuleSchema).max(100).default([]),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set(cfg.members.map((m) => m.agentId));
    // Every rule endpoint must reference a member of the squad (no dangling handoffs).
    for (const [i, r] of cfg.handoffRules.entries()) {
      if (!ids.has(r.fromAgentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['handoffRules', i, 'fromAgentId'],
          message: 'Rule references an agent not in the squad',
        });
      }
      if (!ids.has(r.toAgentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['handoffRules', i, 'toAgentId'],
          message: 'Rule references an agent not in the squad',
        });
      }
    }
    if (cfg.entryAgentId && !ids.has(cfg.entryAgentId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['entryAgentId'],
        message: 'Entry agent must be a squad member',
      });
    }
  });
export type SquadConfig = z.infer<typeof squadConfigSchema>;

/** The specialist that answers first: explicit entry, else the lowest-`order` member. */
export function entryAgent(cfg: SquadConfig): string | null {
  if (cfg.entryAgentId) return cfg.entryAgentId;
  const sorted = [...cfg.members].sort((a, b) => a.order - b.order);
  return sorted[0]?.agentId ?? null;
}

/**
 * Resolve the next specialist for a signal. Returns the target agentId, or null when no
 * rule matches (the current agent keeps the turn). First matching rule wins.
 */
export function resolveHandoff(
  rules: HandoffRule[],
  currentAgentId: string,
  signal: string,
): string | null {
  const rule = rules.find((r) => r.fromAgentId === currentAgentId && r.on === signal);
  return rule?.toAgentId ?? null;
}

// ── Shared context bus ──────────────────────────────────────────────────────────

/** One fact captured during the call, tagged with the agent that captured it. */
export interface ContextEntry {
  key: string;
  value: unknown;
  byAgentId: string;
}

/**
 * Per-call shared state that survives handoffs. Later specialists read what earlier ones
 * captured, so nothing is re-asked. Instances are created per call → scoped to that call's
 * tenant by construction (never shared across calls/tenants).
 */
export class ContextBus {
  private readonly store = new Map<string, ContextEntry>();

  constructor(seed: Record<string, unknown> = {}, byAgentId = 'system') {
    for (const [key, value] of Object.entries(seed)) this.set(key, value, byAgentId);
  }

  set(key: string, value: unknown, byAgentId: string): void {
    if (value === undefined || value === null || value === '') return; // never store empties
    this.store.set(key, { key, value, byAgentId });
  }

  /** Merge a captured-variables record from a turn (last write wins per key). */
  merge(record: Record<string, unknown>, byAgentId: string): void {
    for (const [key, value] of Object.entries(record)) this.set(key, value, byAgentId);
  }

  get(key: string): unknown {
    return this.store.get(key)?.value;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  /** Flat key→value snapshot (for templating the next agent's prompt). */
  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of this.store) out[key] = entry.value;
    return out;
  }

  /**
   * The handoff payload seeding the next specialist: the shared snapshot plus a one-line
   * summary of what's already known, so the receiving agent doesn't repeat questions.
   */
  forHandoff(toAgentId: string): {
    toAgentId: string;
    context: Record<string, unknown>;
    summary: string;
  } {
    const snap = this.snapshot();
    const facts = Object.entries(snap).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`);
    const summary = facts.length
      ? `Known so far — ${facts.join('; ')}.`
      : 'No details captured yet.';
    return { toAgentId, context: snap, summary };
  }
}

// ── Per-node model / voice override ─────────────────────────────────────────────

/**
 * Optional per-node overrides. A node may pin a specific LLM model (cheap for routing,
 * premium for high-stakes) and/or a specific voice. Empty = inherit the agent default.
 */
export const nodeOverrideSchema = z.object({
  modelOverride: z.string().max(80).default(''),
  voiceOverride: z.string().max(80).default(''),
});
export type NodeOverride = z.infer<typeof nodeOverrideSchema>;

/**
 * Resolve the effective model/voice for a node: the node override if set, else the agent
 * default. The router meters against the RESOLVED model, so a per-node swap is billed at
 * that model's rate (self-audit D).
 */
export function resolveNodeOverride(
  override: Partial<NodeOverride> | undefined,
  defaults: { model: string; voiceId: string | null },
): { model: string; voiceId: string | null } {
  return {
    model: override?.modelOverride?.trim() || defaults.model,
    voiceId: override?.voiceOverride?.trim() || defaults.voiceId,
  };
}
