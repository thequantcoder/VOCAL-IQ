import { z } from 'zod';

/**
 * Feature flags (Day 58) — pure resolution + validation shared across api/web. A flag can be set
 * at three scopes with strict precedence: TENANT overrides PLAN overrides GLOBAL. This lets the
 * platform ship a global default, a plan tier override it, and a single tenant override again
 * (beta access, kill-switch). The actual reads/writes are RLS-scoped in the API; here we keep only
 * the pure merge so it is unit-testable and identical on both sides.
 */

export const FLAG_SCOPES = ['GLOBAL', 'PLAN', 'TENANT'] as const;
export type FlagScope = (typeof FLAG_SCOPES)[number];

/** A flag value is a boolean, a number, or a short string (feature limits / variants). */
export const flagValueSchema = z.union([z.boolean(), z.number(), z.string().max(200)]);
export type FlagValue = z.infer<typeof flagValueSchema>;

export const flagInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Use lower-case keys like feature.beta_dialer'),
  value: flagValueSchema,
  scope: z.enum(FLAG_SCOPES),
});
export type FlagInput = z.infer<typeof flagInputSchema>;

export interface FlagEntry {
  scope: FlagScope;
  key: string;
  value: FlagValue;
}

/** Precedence weight — higher wins. */
const RANK: Record<FlagScope, number> = { GLOBAL: 0, PLAN: 1, TENANT: 2 };

/**
 * Resolve the effective value of one key from a set of entries (any scopes). The highest-ranked
 * scope present wins; returns `fallback` when no entry exists. Deterministic — ties can't happen
 * because a (scope,key) pair is unique per resolution set.
 */
export function resolveFlag(
  entries: FlagEntry[],
  key: string,
  fallback: FlagValue = false,
): FlagValue {
  let best: FlagEntry | undefined;
  for (const e of entries) {
    if (e.key !== key) continue;
    if (!best || RANK[e.scope] > RANK[best.scope]) best = e;
  }
  return best ? best.value : fallback;
}

/** Collapse a set of entries into the effective flag map (highest scope per key wins). */
export function resolveAllFlags(entries: FlagEntry[]): Record<string, FlagValue> {
  const byKey = new Map<string, FlagEntry>();
  for (const e of entries) {
    const cur = byKey.get(e.key);
    if (!cur || RANK[e.scope] > RANK[cur.scope]) byKey.set(e.key, e);
  }
  return Object.fromEntries([...byKey].map(([k, e]) => [k, e.value]));
}

/** Truthiness for gating: `true`, a non-zero number, or a non-empty non-"false" string. */
export function isFlagEnabled(value: FlagValue | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0 && value.toLowerCase() !== 'false';
  return false;
}
