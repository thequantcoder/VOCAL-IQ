/**
 * Launch-readiness evaluation (Day 66) — the pure go/no-go gate for a controlled go-live, shared
 * across api/web. Each checklist item is a category × severity; a `blocker` that isn't satisfied
 * means NO-GO. Keeping the rubric pure makes the final launch gate testable + identical on the
 * server (readiness endpoint) and the operator UI.
 */

export type ReadinessCategory =
  | 'billing'
  | 'security'
  | 'compliance'
  | 'observability'
  | 'reliability'
  | 'scale';

export interface ReadinessItem {
  key: string;
  label: string;
  category: ReadinessCategory;
  /** A blocker must pass for go-live; a warning is advisory. */
  severity: 'blocker' | 'warning';
}

/** The go-live checklist. Each item is checked against a live signal at evaluation time. */
export const READINESS_CHECKLIST: ReadinessItem[] = [
  {
    key: 'billing.live',
    label: 'Live billing keys configured (Stripe)',
    category: 'billing',
    severity: 'blocker',
  },
  {
    key: 'security.jwt',
    label: 'Auth signing secret set (APP_JWT_SECRET)',
    category: 'security',
    severity: 'blocker',
  },
  {
    key: 'security.vault',
    label: 'Key-vault master key set (VAULT_MASTER_KEY)',
    category: 'security',
    severity: 'blocker',
  },
  {
    key: 'security.cors',
    label: 'CORS allow-list configured',
    category: 'security',
    severity: 'warning',
  },
  {
    key: 'compliance.retention',
    label: 'Retention + consent controls available',
    category: 'compliance',
    severity: 'blocker',
  },
  {
    key: 'observability.errors',
    label: 'Error monitoring configured (Sentry)',
    category: 'observability',
    severity: 'warning',
  },
  {
    key: 'observability.status',
    label: 'Public status page + uptime monitors',
    category: 'observability',
    severity: 'warning',
  },
  {
    key: 'reliability.db',
    label: 'Database reachable',
    category: 'reliability',
    severity: 'blocker',
  },
  {
    key: 'reliability.backups',
    label: 'Backups + DR verified',
    category: 'reliability',
    severity: 'blocker',
  },
  {
    key: 'reliability.providerFallback',
    label: 'Provider fallback (key-pool ejection) active',
    category: 'reliability',
    severity: 'warning',
  },
  {
    key: 'scale.region',
    label: 'Data region pinned (DATA_REGION)',
    category: 'scale',
    severity: 'warning',
  },
];

export interface ReadinessResult {
  item: ReadinessItem;
  passed: boolean;
  detail?: string;
}

export interface ReadinessReport {
  go: boolean;
  blockersFailed: number;
  warningsFailed: number;
  passed: number;
  total: number;
  results: ReadinessResult[];
}

/**
 * Evaluate readiness given a map of `key → { passed, detail }`. GO only when NO blocker failed
 * (warnings don't block, but are surfaced). An unknown/missing signal counts as failed (fail
 * closed — you can't launch on a check you didn't run).
 */
export function evaluateReadiness(
  signals: Record<string, { passed: boolean; detail?: string } | undefined>,
): ReadinessReport {
  const results: ReadinessResult[] = READINESS_CHECKLIST.map((item) => {
    const s = signals[item.key];
    return {
      item,
      passed: s?.passed ?? false,
      ...(s?.detail ? { detail: s.detail } : {}),
    };
  });
  const blockersFailed = results.filter((r) => !r.passed && r.item.severity === 'blocker').length;
  const warningsFailed = results.filter((r) => !r.passed && r.item.severity === 'warning').length;
  return {
    go: blockersFailed === 0,
    blockersFailed,
    warningsFailed,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    results,
  };
}
