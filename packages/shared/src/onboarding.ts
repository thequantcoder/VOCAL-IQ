/**
 * Onboarding progress (Day 50) — the pure core. Given signals derived from the tenant's real
 * data, produce the guided "first value fast" checklist (create agent → connect number → place
 * a test call → see results), the completion percent, and the next incomplete step. Kept pure so
 * the checklist is deterministic + unit-tested; the web derives the signals from existing queries.
 */

export interface OnboardingSignals {
  hasAgent: boolean;
  hasNumber: boolean;
  hasCall: boolean;
  hasResults: boolean; // a call with a transcript / cost the user can inspect
}

export interface OnboardingStep {
  key: 'create_agent' | 'connect_number' | 'test_call' | 'see_results';
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

export interface OnboardingProgress {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  percent: number; // 0..100
  complete: boolean;
  /** The first step that is not yet done, or null when fully onboarded. */
  nextStep: OnboardingStep | null;
}

const STEP_DEFS: Omit<OnboardingStep, 'done'>[] = [
  {
    key: 'create_agent',
    label: 'Create your first agent',
    hint: 'Design a prompt-based voice agent (or start from a template).',
    href: '/dashboard/agents/new',
  },
  {
    key: 'connect_number',
    label: 'Connect a phone number',
    hint: 'Claim a number from the pool and assign it to your agent.',
    href: '/dashboard/support',
  },
  {
    key: 'test_call',
    label: 'Place a test call',
    hint: 'Call your own phone to hear the agent live — the aha moment.',
    href: '/dashboard/calls',
  },
  {
    key: 'see_results',
    label: 'Review the results',
    hint: 'See the transcript, recording, and per-call cost.',
    href: '/dashboard/calls',
  },
];

/** Build the onboarding checklist from real signals. */
export function computeOnboarding(signals: OnboardingSignals): OnboardingProgress {
  const doneBy: Record<OnboardingStep['key'], boolean> = {
    create_agent: signals.hasAgent,
    connect_number: signals.hasNumber,
    test_call: signals.hasCall,
    see_results: signals.hasResults,
  };
  const steps: OnboardingStep[] = STEP_DEFS.map((s) => ({ ...s, done: doneBy[s.key] }));
  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  return {
    steps,
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100),
    complete: completedCount === totalCount,
    nextStep: steps.find((s) => !s.done) ?? null,
  };
}
