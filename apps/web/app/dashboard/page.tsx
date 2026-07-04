'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Waveform } from '@vocaliq/ui';
import { ArrowRight, Bot, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OnboardingChecklist } from '../../components/onboarding-checklist';
import { formatUsd } from '../../components/ui-bits';
import { useAgents, useCalls } from '../../lib/api';

/** Overview: a premium first surface — the signature waveform + quick stats + CTAs. */
export default function OverviewPage() {
  const agents = useAgents();
  const calls = useCalls();

  const totalSpend = (calls.data?.items ?? []).reduce(
    (sum, c) => sum + (c.costBreakdown?.billable ?? 0),
    0,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <section className="overflow-hidden rounded-vq-card border border-vq-border bg-vq-bg-elevated">
        <div className="flex flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="font-display font-semibold text-2xl text-vq-text-hi">
              Build a voice agent, place a call, see the transcript.
            </h1>
            <p className="max-w-lg text-sm text-vq-text-lo">
              Design a prompt-based agent, run a test call, and review the transcript, recording,
              and per-call cost — all in one place.
            </p>
            <div className="mt-2 flex gap-3">
              <Link href="/dashboard/agents/new">
                <Button variant="primary" size="md">
                  Create an agent <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/dashboard/calls">
                <Button variant="secondary" size="md">
                  View calls
                </Button>
              </Link>
            </div>
          </div>
          <div className="h-16 w-full max-w-xs">
            <Waveform label="VocalIQ" bars={32} />
          </div>
        </div>
      </section>

      <OnboardingChecklist />

      <section className="vq-stagger grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Bot size={18} />}
          label="Agents"
          value={agents.isLoading ? '—' : String(agents.data?.length ?? 0)}
          href="/dashboard/agents"
        />
        <StatCard
          icon={<PhoneCall size={18} />}
          label="Recent calls"
          value={calls.isLoading ? '—' : String(calls.data?.items.length ?? 0)}
          href="/dashboard/calls"
        />
        <StatCard
          label="Recent spend"
          value={calls.isLoading ? '—' : formatUsd(totalSpend)}
          href="/dashboard/calls"
        />
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href} className="focus-visible:outline-none">
      <Card className="vq-lift transition-colors duration-[120ms] hover:border-vq-violet/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-vq-text-lo text-sm">
            {icon}
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="font-display font-semibold text-3xl text-vq-text-hi">{value}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
