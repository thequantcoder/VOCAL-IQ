import { z } from 'zod';

/**
 * Reseller hierarchy (Day 51). Resellers are first-class: a reseller owns, provisions, and
 * suspends its own isolated sub-tenants (building on the Day 4-5 tenant tree + RLS
 * `is_in_subtree`). The provisioning input contract + the pure subtree-descendant walk live
 * here (deterministic + tested); the api enforces isolation via RLS + RESELLER_ADMIN gating.
 */

export const subTenantInputSchema = z.object({
  name: z.string().min(1).max(120),
  ownerEmail: z.string().email(),
  ownerName: z.string().max(120).optional(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, or hyphens')
    .optional(),
  /** New sub-tenants start ACTIVE by default; TRIAL if the reseller offers a trial. */
  status: z.enum(['ACTIVE', 'TRIAL']).default('ACTIVE'),
});
export type SubTenantInput = z.infer<typeof subTenantInputSchema>;

export interface TenantNode {
  id: string;
  parentTenantId: string | null;
}

/**
 * All ids in the subtree rooted at `rootId` (inclusive), given a flat list of tenants. Pure —
 * used to cascade a suspend/reactivate to every descendant. Cycle-safe (a visited guard) and
 * only follows edges present in `tenants`, so it can never escape the reseller's own subtree.
 */
export function descendantIds(tenants: TenantNode[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const t of tenants) {
    if (t.parentTenantId) {
      const list = childrenOf.get(t.parentTenantId) ?? [];
      list.push(t.id);
      childrenOf.set(t.parentTenantId, list);
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return out;
}
