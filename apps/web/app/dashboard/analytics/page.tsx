'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Activity, AlertTriangle, BarChart3 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { BarChart, LineChart, RatioBar } from '../../../components/charts';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { formatUsd } from '../../../components/ui-bits';
import {
  type BudgetStatus,
  type HistoricalAnalytics,
  type LiveSnapshot,
  useAgents,
  useBudget,
  useHistoricalAnalytics,
  useLiveAnalytics,
} from '../../../lib/api';

/** ISO date (YYYY-MM-DD) `n` days before today, in local time. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Analytics dashboard (Day 41): live operator tiles (polled), a spend/budget banner, and
 * historical charts filtered by date range + agent. Charts are the zero-dep SVG set
 * (`components/charts`), matching DESIGN-SYSTEM §5d — calm, data-dense, mono numbers.
 */
export default function AnalyticsPage() {
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => daysAgo(0));
  const [agentId, setAgentId] = useState('');

  const agents = useAgents();
  const live = useLiveAnalytics();
  const budget = useBudget();
  // `to` is inclusive in the UI; the API range is [from, to), so push the end out a day.
  const toExclusive = useMemo(() => daysAgoPlus(to), [to]);
  const historical = useHistoricalAnalytics({
    from,
    to: toExclusive,
    ...(agentId ? { agentId } : {}),
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <BarChart3 size={20} /> Analytics
        </h1>
        <p className="text-sm text-vq-text-lo">
          Live operations plus historical outcomes, sentiment, talk/listen and cost.
        </p>
      </div>

      <LiveTiles snapshot={live.data} loading={live.isLoading} />
      {budget.data && <BudgetBanner budget={budget.data} />}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-vq-card border border-vq-border bg-vq-bg-elevated px-4 py-3">
        <Field label="From" htmlFor="analytics-from">
          <input
            id="analytics-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
          />
        </Field>
        <Field label="To" htmlFor="analytics-to">
          <input
            id="analytics-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
          />
        </Field>
        <Field label="Agent" htmlFor="analytics-agent">
          <select
            id="analytics-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
          >
            <option value="">All agents</option>
            {(agents.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {historical.isLoading ? (
        <LoadingCard rows={4} />
      ) : historical.isError ? (
        <ErrorState
          message={(historical.error as Error).message}
          onRetry={() => historical.refetch()}
        />
      ) : !historical.data || historical.data.totalCalls === 0 ? (
        <EmptyState
          title="No calls in this range"
          hint="Widen the date range or clear the agent filter."
        />
      ) : (
        <Historical data={historical.data} />
      )}
    </div>
  );
}

/** ISO date one day after `iso` (turns an inclusive end date into an exclusive bound). */
function daysAgoPlus(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function LiveTiles({ snapshot, loading }: { snapshot?: LiveSnapshot; loading: boolean }) {
  const s = snapshot;
  return (
    <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Tile
        label="Active calls"
        value={loading ? '—' : String(s?.activeCalls ?? 0)}
        pulse={(s?.activeCalls ?? 0) > 0}
      />
      <Tile label="Calls today" value={loading ? '—' : String(s?.callsToday ?? 0)} />
      <Tile label="Minutes today" value={loading ? '—' : String(s?.minutesToday ?? 0)} />
      <Tile label="Spend today" value={loading ? '—' : formatUsd(s?.spendTodayUsd ?? 0)} />
      <Tile label="Success today" value={loading ? '—' : pct(s?.successRateToday ?? 0)} />
    </section>
  );
}

function Tile({ label, value, pulse }: { label: string; value: string; pulse?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-vq-card border border-vq-border bg-vq-bg-elevated px-4 py-3">
      <span className="flex items-center gap-1.5 text-vq-text-lo text-xs">
        {pulse && <Activity size={12} className="animate-pulse text-vq-cyan" />}
        {label}
      </span>
      <span className="font-display font-semibold text-2xl text-vq-text-hi">{value}</span>
    </div>
  );
}

function BudgetBanner({ budget }: { budget: BudgetStatus }) {
  if (budget.alerts.length === 0) return null;
  const critical = budget.alerts.some((a) => a.level === 'critical');
  return (
    <div
      className={`flex flex-col gap-1 rounded-vq-card border px-4 py-3 ${
        critical ? 'border-vq-danger/40 bg-vq-danger/5' : 'border-vq-warn/40 bg-vq-warn/5'
      }`}
    >
      {budget.alerts.map((a) => (
        <p
          key={`${a.metric}-${a.message}`}
          className={`flex items-center gap-2 text-sm ${critical ? 'text-vq-danger' : 'text-vq-warn'}`}
        >
          <AlertTriangle size={14} /> {a.message}
        </p>
      ))}
    </div>
  );
}

function Historical({ data }: { data: HistoricalAnalytics }) {
  const outcomes = Object.entries(data.outcomes)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const sentiment = data.sentimentTrend.map((d) => ({ label: d.day.slice(5), value: d.value }));
  const cost = data.costByDay.map((d) => ({ label: d.day.slice(5), value: d.value }));
  const calls = data.callsByDay.map((d) => ({ label: d.day.slice(5), value: d.value }));

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-4">
        <Tile label="Total calls" value={String(data.totalCalls)} />
        <Tile label="Minutes" value={String(data.totalMinutes)} />
        <Tile label="Success rate" value={pct(data.successRate)} />
        <Tile label="Drop-off" value={pct(data.dropOffRate)} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Calls per day">
          <BarChart data={calls} />
        </ChartCard>
        <ChartCard title="Outcomes">
          <BarChart data={outcomes} />
        </ChartCard>
        <ChartCard title="Sentiment trend">
          {sentiment.length > 0 ? (
            <LineChart data={sentiment} format={(n) => n.toFixed(2)} />
          ) : (
            <p className="text-sm text-vq-text-lo">No sentiment scored in this range.</p>
          )}
        </ChartCard>
        <ChartCard title="Cost per day">
          <BarChart data={cost} format={formatUsd} color="var(--vq-violet, #7c5cff)" />
        </ChartCard>
        <ChartCard title="Talk vs listen">
          <RatioBar ratio={data.talkListen.agentRatio} leftLabel="Agent" rightLabel="Caller" />
          <p className="mt-2 text-vq-text-lo text-xs">
            Avg interruptions per call: {data.avgInterruptions.toFixed(1)}
          </p>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-vq-text-lo">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1 text-vq-text-lo text-xs">
      {label}
      {children}
    </label>
  );
}
