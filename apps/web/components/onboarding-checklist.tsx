'use client';

import { type OnboardingStep, computeOnboarding } from '@vocaliq/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { ArrowRight, Check, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import { useCalls, useNumbers } from '../lib/api';
import { useAgents } from '../lib/api';

/**
 * Smart onboarding checklist (Day 50, DESIGN-SYSTEM §6). "First value fast": guides a new
 * tenant through create agent → connect number → test call → see results. Progress is derived
 * from real data (pure `computeOnboarding`); the card disappears once fully onboarded so it's
 * never in the way. Entrance is motion-polished + reduced-motion-safe (CSS `vq-reveal`).
 */
export function OnboardingChecklist() {
  const agents = useAgents();
  const calls = useCalls();
  const numbers = useNumbers();

  // Wait for the signals before deciding whether to show (avoids a flash for onboarded tenants).
  if (agents.isLoading || calls.isLoading || numbers.isLoading) return null;

  const items = calls.data?.items ?? [];
  const progress = computeOnboarding({
    hasAgent: (agents.data?.length ?? 0) > 0,
    hasNumber: (numbers.data?.owned.length ?? 0) > 0,
    hasCall: items.length > 0,
    hasResults: items.some((c) => c.status === 'COMPLETED'),
  });

  if (progress.complete) return null;

  return (
    <Card className="vq-reveal overflow-hidden">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Get started with VocalIQ</CardTitle>
        <span className="font-mono text-vq-text-lo text-xs">
          {progress.completedCount}/{progress.totalCount} done
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Progress bar */}
        <div className="h-1.5 overflow-hidden rounded-vq-pill bg-vq-bg-base">
          <div
            className="vq-lift h-full rounded-vq-pill bg-vq-violet transition-[width] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        <ul className="vq-stagger flex flex-col gap-1.5">
          {progress.steps.map((step) => (
            <StepRow key={step.key} step={step} isNext={progress.nextStep?.key === step.key} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StepRow({ step, isNext }: { step: OnboardingStep; isNext: boolean }) {
  const content = (
    <div
      className={`flex items-center gap-3 rounded-vq px-3 py-2 ${
        isNext ? 'vq-lift border border-vq-violet/40 bg-vq-violet/5' : ''
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
          step.done
            ? 'border-vq-success bg-vq-success text-white'
            : 'border-vq-border text-vq-text-lo'
        }`}
        aria-hidden
      >
        {step.done ? <Check size={13} /> : ''}
      </span>
      <div className="flex min-w-0 flex-col">
        <span
          className={`text-sm ${step.done ? 'text-vq-text-lo line-through' : 'text-vq-text-hi'}`}
        >
          {step.label}
        </span>
        {!step.done && isNext && <span className="text-vq-text-lo text-xs">{step.hint}</span>}
      </div>
      {!step.done && isNext && <ArrowRight size={15} className="ml-auto shrink-0 text-vq-violet" />}
    </div>
  );

  return <li>{step.done ? content : <Link href={step.href}>{content}</Link>}</li>;
}

/** A celebratory line shown once for freshly-onboarded tenants (kept tiny + optional). */
export function OnboardingDoneBadge() {
  return (
    <span className="flex items-center gap-1.5 text-vq-success text-xs">
      <PartyPopper size={14} /> You're all set up.
    </span>
  );
}
