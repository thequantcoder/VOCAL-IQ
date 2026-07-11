'use client';

import {
  Button,
  Dialog,
  DialogContent,
  Illustration,
  type IllustrationName,
  Stepper,
  fireConfetti,
} from '@vocaliq/ui';
import { Reveal, Stagger, StaggerItem } from '@vocaliq/ui/motion';
import { ArrowRight, CalendarCheck, ClipboardList, Headphones, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect } from 'react';
import { track } from '../lib/analytics';
import { useAgents } from '../lib/api';
import { type UseCase, setOnboarding, useOnboarding } from '../lib/onboarding-store';

const STEPS = [
  { label: 'Welcome' },
  { label: 'Use-case' },
  { label: 'Agent' },
  { label: 'Channel' },
  { label: 'Done' },
];

const USE_CASES: { key: UseCase; label: string; hint: string; icon: ReactNode }[] = [
  {
    key: 'sales',
    label: 'Sales & outbound',
    hint: 'Qualify + book leads',
    icon: <Megaphone size={18} />,
  },
  {
    key: 'support',
    label: 'Support',
    hint: 'Answer + deflect calls',
    icon: <Headphones size={18} />,
  },
  {
    key: 'appointments',
    label: 'Appointments',
    hint: 'Book + remind',
    icon: <CalendarCheck size={18} />,
  },
  { key: 'surveys', label: 'Surveys', hint: 'Collect feedback', icon: <ClipboardList size={18} /> },
];

const STEP_ART: IllustrationName[] = ['all-done', 'no-leads', 'no-agents', 'no-calls', 'all-done'];

/**
 * First-run onboarding wizard (UX-14) — a resumable, skippable 5-step flow that gets a new user to
 * first value: Welcome → Use-case → Create agent → Connect a channel → Done (confetti). Built on the
 * focus-trapped Dialog, with per-step illustrations + staggered motion + a `Stepper`. Only auto-opens
 * for a genuinely new workspace (no agents) that hasn't completed/dismissed it. Fires PostHog events.
 */
export function OnboardingWizard() {
  const state = useOnboarding();
  const agents = useAgents();

  const isNew = !agents.isLoading && (agents.data?.length ?? 0) === 0;
  const open = isNew && !state.completed && !state.dismissed;

  // Fire the "started" event once when the wizard first opens.
  useEffect(() => {
    if (open && state.step === 0) track('onboarding_started');
  }, [open, state.step]);

  const go = (step: number) => {
    setOnboarding({ step });
    track('onboarding_step', { step });
  };
  const skip = () => {
    setOnboarding({ dismissed: true });
    track('onboarding_skipped', { step: state.step });
  };
  const finish = () => {
    setOnboarding({ completed: true });
    track('onboarding_completed');
    fireConfetti();
  };

  const step = Math.max(0, Math.min(STEPS.length - 1, state.step));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && skip()}>
      <DialogContent className="max-w-lg">
        <div className="flex flex-col gap-5">
          <Stepper steps={STEPS} current={step} />

          <Reveal key={step} className="flex flex-col items-center gap-3 text-center">
            <Illustration name={STEP_ART[step] ?? 'all-done'} size={112} />
            <StepBody
              step={step}
              useCase={state.useCase}
              onPickUseCase={(u) => setOnboarding({ useCase: u })}
            />
          </Reveal>

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={skip}>
              Skip for now
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" size="sm" onClick={() => go(step - 1)}>
                  Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => go(step + 1)}
                  disabled={step === 1 && !state.useCase}
                >
                  Continue <ArrowRight size={15} />
                </Button>
              ) : (
                <Button size="sm" onClick={finish}>
                  Finish 🎉
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepBody({
  step,
  useCase,
  onPickUseCase,
}: {
  step: number;
  useCase: UseCase | null;
  onPickUseCase: (u: UseCase) => void;
}) {
  if (step === 0) {
    return (
      <>
        <h2 className="font-display font-semibold text-vq-text-hi text-xl">
          Welcome to VocalIQ 👋
        </h2>
        <p className="max-w-sm text-sm text-vq-text-lo">
          Let's get you to your first call in a few quick steps — design an AI voice agent, put it
          on a channel, and hear it work.
        </p>
      </>
    );
  }
  if (step === 1) {
    return (
      <>
        <h2 className="font-display font-semibold text-vq-text-hi text-lg">
          What will your agent do?
        </h2>
        <Stagger className="grid w-full grid-cols-2 gap-2">
          {USE_CASES.map((u) => (
            <StaggerItem key={u.key}>
              <button
                type="button"
                onClick={() => onPickUseCase(u.key)}
                aria-pressed={useCase === u.key}
                className={`flex w-full flex-col items-start gap-1 rounded-vq border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring ${
                  useCase === u.key
                    ? 'border-vq-violet bg-vq-violet/8'
                    : 'border-vq-border hover:border-vq-violet/40'
                }`}
              >
                <span className="text-vq-violet">{u.icon}</span>
                <span className="font-medium text-sm text-vq-text-hi">{u.label}</span>
                <span className="text-vq-text-lo text-xs">{u.hint}</span>
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      </>
    );
  }
  if (step === 2) {
    return (
      <>
        <h2 className="font-display font-semibold text-vq-text-hi text-lg">
          Create your first agent
        </h2>
        <p className="max-w-sm text-sm text-vq-text-lo">
          Design a prompt-based agent in the builder — start from a template or a blank canvas. You
          can come back here anytime.
        </p>
        <Link href="/dashboard/agents/new">
          <Button size="sm" variant="secondary">
            Open the agent builder <ArrowRight size={15} />
          </Button>
        </Link>
      </>
    );
  }
  if (step === 3) {
    return (
      <>
        <h2 className="font-display font-semibold text-vq-text-hi text-lg">Connect a channel</h2>
        <p className="max-w-sm text-sm text-vq-text-lo">
          Put your agent on a phone number, the web widget, or SIP — then place a test call to hear
          it live.
        </p>
        <Link href="/dashboard/calls">
          <Button size="sm" variant="secondary">
            Place a test call <ArrowRight size={15} />
          </Button>
        </Link>
      </>
    );
  }
  return (
    <>
      <h2 className="font-display font-semibold text-vq-text-hi text-xl">You're all set!</h2>
      <p className="max-w-sm text-sm text-vq-text-lo">
        That's the loop: build → connect → call → analyse. Invite your team and start shipping voice
        agents.
      </p>
    </>
  );
}
