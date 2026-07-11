'use client';

import { type OnboardingStep, computeOnboarding } from '@vocaliq/shared';
import { Card, CardContent, CardHeader, CardTitle, CircularProgress } from '@vocaliq/ui';
import { ArrowRight, Check, PartyPopper, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAgents, useCalls, useNumbers } from '../lib/api';
import { celebrateMilestone } from '../lib/celebrate';

const DISMISS_KEY = 'vq-checklist-dismissed';

/**
 * Smart onboarding checklist v2 (Day 50 → UX-14b). "First value fast": guides a new tenant through
 * create agent → connect number → test call → see results, derived from real data (`computeOnboarding`).
 * v2 adds an animated progress ring, a dismiss control, and a one-time confetti celebration when the
 * tenant crosses the finish line. Reduced-motion-safe (the ring/entrance degrade).
 */
export function OnboardingChecklist() {
  const agents = useAgents();
  const calls = useCalls();
  const numbers = useNumbers();

  const loading = agents.isLoading || calls.isLoading || numbers.isLoading;
  const items = calls.data?.items ?? [];
  const progress = loading
    ? null
    : computeOnboarding({
        hasAgent: (agents.data?.length ?? 0) > 0,
        hasNumber: (numbers.data?.owned.length ?? 0) > 0,
        hasCall: items.length > 0,
        hasResults: items.some((c) => c.status === 'COMPLETED'),
      });
  const complete = progress?.complete ?? false;

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  // Celebrate crossing the finish line — once.
  const celebrated = useRef(false);
  useEffect(() => {
    if (complete && !celebrated.current) {
      celebrated.current = true;
      celebrateMilestone(
        'onboarding-complete',
        "You're all set up! 🎉",
        'Nice work — go place a call.',
      );
    }
  }, [complete]);

  if (loading || !progress || complete || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <Card className="vq-reveal overflow-hidden">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CircularProgress value={progress.percent} size={40}>
            {progress.completedCount}/{progress.totalCount}
          </CircularProgress>
          <div className="flex flex-col">
            <CardTitle className="text-base">Get started with VocalIQ</CardTitle>
            <span className="text-vq-text-lo text-xs">
              {progress.nextStep?.hint ?? 'Almost there'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss checklist"
          className="grid size-7 place-items-center rounded-vq text-vq-text-lo transition-colors hover:bg-vq-bg-base hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
        >
          <X size={15} />
        </button>
      </CardHeader>
      <CardContent>
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
