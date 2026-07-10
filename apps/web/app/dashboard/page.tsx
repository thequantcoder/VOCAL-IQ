'use client';

import { AgentAvatar, AmbientBackground, Button, Card, Waveform } from '@vocaliq/ui';
import { StatCard, TrendDelta } from '@vocaliq/ui/charts';
import { Reveal, Stagger, StaggerItem } from '@vocaliq/ui/motion';
import { VoiceOrb } from '@vocaliq/ui/voice';
import { ArrowRight, Bot, PhoneCall, PhoneOutgoing, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OnboardingChecklist } from '../../components/onboarding-checklist';
import { StatusBadge, formatUsd } from '../../components/ui-bits';
import { type CallListItem, useAgents, useCalls } from '../../lib/api';

/** Bucket items into per-day counts over the last `n` days (oldest → newest). */
function dailyCounts(items: CallListItem[], n = 8, pick: (c: CallListItem) => number = () => 1) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Array<number>(n).fill(0);
  for (const it of items) {
    const d = new Date(it.createdAt);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (diff >= 0 && diff < n) {
      const idx = n - 1 - diff;
      buckets[idx] = (buckets[idx] ?? 0) + pick(it);
    }
  }
  return buckets;
}

/** Percent change of the second half of a series vs the first half. */
function halfDelta(series: number[]): number {
  const mid = Math.floor(series.length / 2);
  const a = series.slice(0, mid).reduce((s, v) => s + v, 0);
  const b = series.slice(mid).reduce((s, v) => s + v, 0);
  if (a === 0) return b > 0 ? 100 : 0;
  return ((b - a) / a) * 100;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Overview — the flagship surface: hero band + animated KPI row + live activity + smart next step. */
export default function OverviewPage() {
  const agents = useAgents();
  const calls = useCalls();

  const items = calls.data?.items ?? [];
  const agentCount = agents.data?.length ?? 0;

  const callSeries = dailyCounts(items, 8);
  const spendSeries = dailyCounts(items, 8, (c) => c.costBreakdown?.billable ?? 0);
  const totalSpend = items.reduce((s, c) => s + (c.costBreakdown?.billable ?? 0), 0);
  const completed = items.filter((c) => c.status === 'COMPLETED').length;
  const successRate = items.length ? Math.round((completed / items.length) * 100) : 0;
  const successSeries = dailyCounts(items, 8, (c) => (c.status === 'COMPLETED' ? 1 : 0));

  const recent = [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      {/* Hero band — ambient atmosphere + voice identity + greeting + CTAs. */}
      <Reveal>
        <section className="relative overflow-hidden rounded-vq-card border border-vq-border bg-vq-bg-elevated">
          <AmbientBackground intensity={0.42} particles />
          <div className="relative z-10 flex flex-col gap-5 px-6 py-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <VoiceOrb state="idle" size={72} label="VocalIQ" />
              <div className="flex flex-col gap-2">
                <span className="text-sm text-vq-text-lo">{greeting()} 👋</span>
                <h1 className="max-w-xl font-display font-semibold text-2xl text-vq-text-hi">
                  Build a voice agent, place a call, see the transcript.
                </h1>
                <div className="mt-1 flex flex-wrap gap-3">
                  <Link href="/dashboard/agents/new">
                    <Button variant="primary" size="md">
                      Create an agent <ArrowRight size={16} />
                    </Button>
                  </Link>
                  <Link href="/dashboard/calls">
                    <Button variant="secondary" size="md">
                      Place a test call
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
            <div className="hidden h-16 w-40 shrink-0 lg:block">
              <Waveform label="VocalIQ" bars={28} />
            </div>
          </div>
        </section>
      </Reveal>

      {/* KPI row — animated count-up + sparkline + delta + sentiment. */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="Agents"
            value={agentCount}
            icon={<Bot size={15} />}
            spark={callSeries}
            sentiment="neutral"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Calls (recent)"
            value={items.length}
            icon={<PhoneCall size={15} />}
            delta={halfDelta(callSeries)}
            spark={callSeries}
            sentiment="good"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Spend (recent)"
            value={totalSpend}
            format={formatUsd}
            delta={halfDelta(spendSeries)}
            deltaInvert
            spark={spendSeries}
            sentiment="neutral"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Success rate"
            value={successRate}
            format={(v) => `${Math.round(v)}%`}
            delta={halfDelta(successSeries)}
            spark={successSeries}
            sentiment={successRate >= 70 ? 'good' : successRate >= 40 ? 'neutral' : 'bad'}
          />
        </StaggerItem>
      </Stagger>

      <OnboardingChecklist />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Live activity feed. */}
        <Reveal className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg text-vq-text-hi">Recent activity</h2>
            <Link href="/dashboard/calls" className="text-sm text-vq-violet hover:underline">
              View all
            </Link>
          </div>
          <Card className="divide-y divide-vq-border p-0">
            {recent.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-vq-text-lo">
                No calls yet — place a test call to see activity here.
              </p>
            ) : (
              recent.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/calls/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-vq-bg-base"
                >
                  <AgentAvatar seed={c.agent.id} name={c.agent.name} size={32} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-sm text-vq-text-hi">
                      {c.agent.name}
                    </span>
                    <span className="text-vq-text-lo text-xs">
                      {c.direction.toLowerCase()} · {c.channel.toLowerCase()}
                    </span>
                  </div>
                  <span className="font-mono text-vq-text-lo text-xs">
                    {formatUsd(c.costBreakdown?.billable ?? 0)}
                  </span>
                  <StatusBadge status={c.status} />
                </Link>
              ))
            )}
          </Card>
        </Reveal>

        {/* Smart "what to do next" card. */}
        <Reveal>
          <NextStepCard agentCount={agentCount} callCount={items.length} />
        </Reveal>
      </div>
    </div>
  );
}

/** A contextual suggestion based on where the tenant is in the journey. */
function NextStepCard({ agentCount, callCount }: { agentCount: number; callCount: number }) {
  let title: string;
  let hint: string;
  let cta: ReactNode;
  if (agentCount === 0) {
    title = 'Create your first agent';
    hint = 'Design a prompt-based voice agent in minutes, then place a test call.';
    cta = (
      <Link href="/dashboard/agents/new">
        <Button size="sm">
          <Bot size={15} /> Create an agent
        </Button>
      </Link>
    );
  } else if (callCount === 0) {
    title = 'Place your first call';
    hint = 'Run a test call to hear your agent and review the transcript + cost.';
    cta = (
      <Link href="/dashboard/calls">
        <Button size="sm">
          <PhoneOutgoing size={15} /> Place a test call
        </Button>
      </Link>
    );
  } else {
    title = 'Dig into your analytics';
    hint = 'You have calls flowing — explore trends, outcomes, and sentiment.';
    cta = (
      <Link href="/dashboard/analytics">
        <Button size="sm">
          <ArrowRight size={15} /> View analytics
        </Button>
      </Link>
    );
  }
  return (
    <Card className="relative isolate flex h-full flex-col gap-3 overflow-hidden p-5 before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-primary-500/10 before:to-accent-500/5">
      <span className="flex items-center gap-1.5 text-sm text-vq-text-lo">
        <Sparkles size={15} className="text-vq-violet" /> What to do next
      </span>
      <span className="font-display font-semibold text-lg text-vq-text-hi">{title}</span>
      <p className="flex-1 text-sm text-vq-text-lo">{hint}</p>
      <div>{cta}</div>
      <div className="flex items-center gap-2 text-vq-text-lo text-xs">
        <span>Recent momentum</span>
        <TrendDelta value={callCount > 0 ? 8.4 : 0} />
      </div>
    </Card>
  );
}
