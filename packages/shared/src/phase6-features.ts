/**
 * Phase-6 advanced-tier feature entitlements (Day 94) — the pure catalogue + plan-tier resolution
 * shared across api/web. The advanced features (Days 73–93) are premium: some are compute-heavy or
 * touch sensitive data, so they're gated by plan. This module is the single source of truth for WHICH
 * features exist and which plan tier includes each — deterministic + unit-tested, no DB.
 *
 * Resolution order (see {@link planIncludesFeature}): an explicit boolean on the plan's `features` map
 * ALWAYS wins (the no-code plan builder / a custom plan can override); otherwise the tier default for
 * the plan name applies; unknown → denied. So a fresh install with empty plan features still gets
 * correct, priced entitlements from the tier name alone.
 */

export interface Phase6Feature {
  key: string;
  label: string;
  /** Compute-heavy or high-cost (video, translation) — worth calling out for margin review (self-audit D). */
  heavy: boolean;
}

/** The advanced-tier features shipped in Phase 6 (Days 73–93) that are plan-gated. */
export const PHASE6_FEATURES = [
  { key: 'conversationIntel', label: 'Conversation intelligence', heavy: false },
  { key: 'learnFromCalls', label: 'Learn from top reps', heavy: false },
  { key: 'liveCopilot', label: 'Live call co-pilot', heavy: false },
  { key: 'extraChannels', label: 'Telegram / Messenger / Instagram / RCS', heavy: false },
  { key: 'workflowAutomation', label: 'Visual workflow automation', heavy: false },
  { key: 'voiceAnalyticsApi', label: 'Voice analytics BI API', heavy: false },
  { key: 'multiAgentBenchmarking', label: 'Multi-agent benchmarking', heavy: false },
  { key: 'developerApps', label: 'Developer apps & integrations', heavy: false },
  { key: 'marketplace', label: 'Agent marketplace', heavy: false },
  { key: 'translation', label: 'Real-time translation', heavy: true },
  { key: 'videoAvatar', label: 'Video avatar agents', heavy: true },
  { key: 'voiceBiometrics', label: 'Voice biometrics', heavy: true },
] as const;

export type Phase6FeatureKey = (typeof PHASE6_FEATURES)[number]['key'];

const ALL_KEYS = PHASE6_FEATURES.map((f) => f.key) as Phase6FeatureKey[];

const proSet: Phase6FeatureKey[] = [
  'conversationIntel',
  'learnFromCalls',
  'liveCopilot',
  'extraChannels',
  'workflowAutomation',
  'voiceAnalyticsApi',
  'multiAgentBenchmarking',
  'translation',
];

function asMap(keys: Phase6FeatureKey[]): Record<Phase6FeatureKey, boolean> {
  const m = {} as Record<Phase6FeatureKey, boolean>;
  for (const k of ALL_KEYS) m[k] = keys.includes(k);
  return m;
}

/**
 * Default advanced-feature entitlements by plan tier (by plan NAME). Free ships the core platform only;
 * Pro unlocks the lighter advanced features; Scale unlocks everything incl. the heavy/sensitive ones
 * (video avatars, voice biometrics) + the developer/marketplace surfaces. A custom plan can override
 * any of these via its stored `features` map.
 */
export const PLAN_FEATURE_DEFAULTS: Record<string, Record<Phase6FeatureKey, boolean>> = {
  Free: asMap([]),
  Pro: asMap(proSet),
  Scale: asMap(ALL_KEYS),
};

/**
 * Does a plan include an advanced feature? An explicit boolean on the plan's `features` map wins;
 * otherwise the tier default for `planName` applies; unknown plan/feature → denied. Pure.
 */
export function planIncludesFeature(
  planName: string,
  features: Record<string, unknown> | null | undefined,
  key: Phase6FeatureKey,
): boolean {
  const explicit = features?.[key];
  if (typeof explicit === 'boolean') return explicit;
  return PLAN_FEATURE_DEFAULTS[planName]?.[key] ?? false;
}

/** Resolve the full advanced-feature map for a plan (explicit overrides on top of the tier default). Pure. */
export function resolveAdvancedFeatures(
  planName: string,
  features: Record<string, unknown> | null | undefined,
): Record<Phase6FeatureKey, boolean> {
  const out = {} as Record<Phase6FeatureKey, boolean>;
  for (const k of ALL_KEYS) out[k] = planIncludesFeature(planName, features, k);
  return out;
}
