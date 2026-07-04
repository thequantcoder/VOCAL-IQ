import { z } from 'zod';

/**
 * Quota enforcement (Day 58) — pure policy evaluation shared across api/web. A quota compares a
 * resource's usage against a plan limit under a policy: `hard` blocks (and may auto-suspend) at
 * the cap; `soft` allows overage but warns. Threshold crossings drive notifications. The pure
 * decision lives here so the API just applies the returned action; money/usage are integers.
 */

export const QUOTA_POLICIES = ['hard', 'soft'] as const;
export type QuotaPolicy = (typeof QUOTA_POLICIES)[number];

export const quotaPolicySchema = z.object({
  policy: z.enum(QUOTA_POLICIES).default('hard'),
  /** Fraction (0–1) at which to warn before the cap (e.g. 0.8 = warn at 80%). */
  warnAt: z.number().min(0).max(1).default(0.8),
  /** On a hard overage: suspend the tenant, or just block the action. */
  onHardOverage: z.enum(['block', 'suspend']).default('block'),
});
export type QuotaConfig = z.infer<typeof quotaPolicySchema>;

export type QuotaState = 'ok' | 'warn' | 'over';
export type QuotaAction = 'allow' | 'warn' | 'block' | 'suspend';

export interface QuotaResult {
  state: QuotaState;
  action: QuotaAction;
  /** Usage as a fraction of the limit (0 when the limit is 0/unlimited-sentinel). */
  ratio: number;
  used: number;
  limit: number;
  /** True exactly on the transition into warn/over (caller notifies once). */
  crossedWarn: boolean;
  crossedOver: boolean;
}

/**
 * Evaluate a quota. `limit <= 0` means "unlimited" → always `allow`. Otherwise:
 *  - used >= limit  → over  → hard: block|suspend, soft: warn (allow with a flag)
 *  - used >= warnAt*limit → warn (allow)
 *  - else → ok (allow)
 * `previousUsed` (usage before this increment) lets the caller notify only on the crossing.
 */
export function evaluateQuota(
  used: number,
  limit: number,
  config: QuotaConfig,
  previousUsed = used,
): QuotaResult {
  if (limit <= 0) {
    return {
      state: 'ok',
      action: 'allow',
      ratio: 0,
      used,
      limit,
      crossedWarn: false,
      crossedOver: false,
    };
  }
  const ratio = used / limit;
  const warnLine = config.warnAt * limit;
  const wasOver = previousUsed >= limit;
  const wasWarn = previousUsed >= warnLine;

  if (used >= limit) {
    const action: QuotaAction =
      config.policy === 'hard'
        ? config.onHardOverage === 'suspend'
          ? 'suspend'
          : 'block'
        : 'warn';
    return {
      state: 'over',
      action,
      ratio,
      used,
      limit,
      crossedWarn: !wasWarn,
      crossedOver: !wasOver,
    };
  }
  if (used >= warnLine) {
    return {
      state: 'warn',
      action: 'warn',
      ratio,
      used,
      limit,
      crossedWarn: !wasWarn,
      crossedOver: false,
    };
  }
  return {
    state: 'ok',
    action: 'allow',
    ratio,
    used,
    limit,
    crossedWarn: false,
    crossedOver: false,
  };
}
