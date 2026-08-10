import { detectObjections } from './coaching.js';

/**
 * Conversation intelligence (Day 75) — mine every call for business signal. Pure, deterministic
 * extraction of objections, buying signals, competitor mentions, feature requests, and churn risk
 * from a transcript, plus aggregation into trends and alert evaluation. Deterministic on purpose:
 * it runs on the transcript the post-call worker already produced, so conversation intelligence
 * adds ZERO extra LLM spend (self-audit D) and its accuracy is fully unit-testable (self-audit A).
 * Competitor detection is driven by the tenant's own watchlist.
 */

export const SIGNAL_TYPES = [
  'objection',
  'buying_signal',
  'competitor',
  'feature_request',
  'churn_risk',
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export interface DetectedSignal {
  type: SignalType;
  /** Normalized label — objection tag, buying-signal kind, competitor name, or 'feature_request'/'churn_risk'. */
  label: string;
  /** The snippet that triggered it (for the drill-down UI). */
  quote?: string;
}

const BUYING_CUES: { label: string; cues: string[] }[] = [
  {
    label: 'ready_to_buy',
    cues: [
      'ready to buy',
      'sign us up',
      'sign me up',
      'let’s do it',
      'lets do it',
      'move forward',
      'get started',
      'where do i sign',
    ],
  },
  {
    label: 'pricing_interest',
    cues: [
      'how much does it cost',
      'what’s the price',
      'whats the price',
      'send me a quote',
      'pricing',
      'what would it cost',
    ],
  },
  {
    label: 'demo_request',
    cues: [
      'can i see a demo',
      'book a demo',
      'schedule a demo',
      'show me how it works',
      'trial',
      'free trial',
    ],
  },
  {
    label: 'timeline',
    cues: ['when can we start', 'how soon can', 'start next week', 'this quarter', 'by end of'],
  },
  {
    label: 'procurement',
    cues: [
      'purchase order',
      'send me a contract',
      'send the paperwork',
      'procurement',
      'invoice us',
    ],
  },
];

const FEATURE_CUES = [
  'do you support',
  'does it support',
  'can it integrate',
  'integrate with',
  'i wish it could',
  'it would be great if',
  'is there a way to',
  'can you add',
  'feature request',
  'do you have an api',
  'does it do',
];

const CHURN_CUES = [
  'cancel',
  'refund',
  'switch away',
  'switching to',
  'not happy',
  'disappointed',
  'too many issues',
  'thinking of leaving',
  'want to leave',
  'unhappy with',
];

function firstMatchQuote(text: string, cues: string[]): string | undefined {
  const lower = text.toLowerCase();
  for (const c of cues) {
    const i = lower.indexOf(c);
    if (i >= 0) return text.slice(Math.max(0, i - 20), i + c.length + 30).trim();
  }
  return undefined;
}

/**
 * Extract every business signal from a transcript (deterministic). Objections reuse the coaching
 * detector; competitor mentions are matched against the tenant's watchlist (case-insensitive).
 */
export function extractSignals(text: string, competitors: string[] = []): DetectedSignal[] {
  const lower = text.toLowerCase();
  const signals: DetectedSignal[] = [];

  // Objections (shared with the copilot detector).
  for (const o of detectObjections(text)) {
    signals.push({ type: 'objection', label: o.tag });
  }

  // Buying signals.
  for (const b of BUYING_CUES) {
    if (b.cues.some((c) => lower.includes(c))) {
      const q = firstMatchQuote(text, b.cues);
      signals.push({ type: 'buying_signal', label: b.label, ...(q ? { quote: q } : {}) });
    }
  }

  // Competitor mentions (watchlist-driven — each named competitor is its own trend line).
  for (const name of competitors) {
    const n = name.trim();
    if (n.length > 0 && lower.includes(n.toLowerCase())) {
      const q = firstMatchQuote(text, [n.toLowerCase()]);
      signals.push({ type: 'competitor', label: n, ...(q ? { quote: q } : {}) });
    }
  }

  // Feature requests.
  if (FEATURE_CUES.some((c) => lower.includes(c))) {
    const q = firstMatchQuote(text, FEATURE_CUES);
    signals.push({ type: 'feature_request', label: 'feature_request', ...(q ? { quote: q } : {}) });
  }

  // Churn risk.
  if (CHURN_CUES.some((c) => lower.includes(c))) {
    const q = firstMatchQuote(text, CHURN_CUES);
    signals.push({ type: 'churn_risk', label: 'churn_risk', ...(q ? { quote: q } : {}) });
  }

  return signals;
}

// ── Aggregation (trends) ─────────────────────────────────────────────────────────────

export interface SignalAggregate {
  type: SignalType;
  label: string;
  count: number;
}

/** Group signals by (type, label) into counts, sorted by count desc then label — the trend view. */
export function aggregateSignals(
  signals: { type: SignalType; label: string }[],
): SignalAggregate[] {
  const map = new Map<string, SignalAggregate>();
  for (const s of signals) {
    const key = `${s.type}::${s.label}`;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { type: s.type, label: s.label, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ── Alerts ─────────────────────────────────────────────────────────────────────────────

export interface SignalAlertRule {
  type: SignalType;
  /** Optional specific label (e.g. a competitor name). Omit to alert on the type's total. */
  label?: string;
  /** Fire when the matching count reaches this threshold within the window. */
  threshold: number;
}
export interface FiredSignalAlert {
  type: SignalType;
  label: string;
  count: number;
  threshold: number;
}

/**
 * Evaluate alert rules against an aggregate. A rule with a `label` matches that exact line; a
 * rule without one matches the type's summed count across labels. Returns the breaches to notify.
 */
export function evaluateSignalAlerts(
  aggregate: SignalAggregate[],
  rules: SignalAlertRule[],
): FiredSignalAlert[] {
  const fired: FiredSignalAlert[] = [];
  for (const rule of rules) {
    if (rule.label) {
      const row = aggregate.find((a) => a.type === rule.type && a.label === rule.label);
      const count = row?.count ?? 0;
      if (count >= rule.threshold)
        fired.push({ type: rule.type, label: rule.label, count, threshold: rule.threshold });
    } else {
      const count = aggregate.filter((a) => a.type === rule.type).reduce((n, a) => n + a.count, 0);
      if (count >= rule.threshold)
        fired.push({ type: rule.type, label: '*', count, threshold: rule.threshold });
    }
  }
  return fired;
}
