'use client';

import { BENCHMARK_METRICS, INDUSTRIES } from '@vocaliq/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Lightbulb, Trophy } from 'lucide-react';
import { BarChart, type Point } from '../../../components/charts';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type BenchmarkRecommendation,
  useBenchmarkSettings,
  useInternalBenchmark,
  usePeerBenchmark,
  useUpdateBenchmarkSettings,
} from '../../../lib/api';

const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi';

function fmt(key: string, v: number | null | undefined): string {
  if (typeof v !== 'number') return '—';
  const meta = BENCHMARK_METRICS.find((m) => m.key === key);
  if (meta?.unit === 'percent') return `${v.toFixed(1)}%`;
  if (meta?.unit === 'usd') return `$${v.toFixed(2)}`;
  return v.toFixed(2);
}

/**
 * Analytics benchmarking (Day 86). Compare your agents against your own history, and — if you opt in —
 * against anonymized peer averages for your industry (only ever shown as aggregates over ≥5 peers).
 */
export default function BenchmarkingPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Trophy size={20} /> Benchmarking
        </h1>
        <p className="text-sm text-vq-text-lo">
          See what “good” looks like: compare your agents internally, and against anonymized
          industry peers.
        </p>
      </div>

      <SettingsCard />
      <InternalCard />
      <PeerCard />
    </div>
  );
}

function SettingsCard() {
  const settings = useBenchmarkSettings();
  const update = useUpdateBenchmarkSettings();
  const s = settings.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Peer benchmarking</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-vq-text-lo">
          Opt in to contribute anonymized aggregates and unlock peer benchmarks. Your raw data is
          never shared — only averages over a cohort of at least 5 opted-in tenants.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-vq-text-hi">
            <input
              type="checkbox"
              checked={s?.optIn ?? false}
              disabled={!s || update.isPending}
              onChange={(e) =>
                update.mutate({ optIn: e.target.checked, industry: s?.industry ?? 'other' })
              }
            />
            Opt in to peer benchmarking
          </label>
          <label htmlFor="industry" className="flex items-center gap-2 text-sm text-vq-text-lo">
            Industry
            <select
              id="industry"
              className={SELECT_CLS}
              value={s?.industry ?? 'other'}
              disabled={!s || update.isPending}
              onChange={(e) =>
                update.mutate({ optIn: s?.optIn ?? false, industry: e.target.value })
              }
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

function InternalCard() {
  const internal = useInternalBenchmark();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your agents (last 30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        {internal.isLoading ? (
          <LoadingCard rows={3} />
        ) : internal.isError ? (
          <ErrorState
            message={(internal.error as Error).message}
            onRetry={() => internal.refetch()}
          />
        ) : !internal.data || internal.data.agents.length === 0 ? (
          <EmptyState title="No agent data yet" hint="Run some calls to compare your agents." />
        ) : (
          <div className="flex flex-col gap-4">
            {BENCHMARK_METRICS.map((m) => {
              const data: Point[] = internal
                .data!.agents.map((a) => ({ label: a.name, value: a.metrics[m.key] }))
                .filter((p): p is Point => typeof p.value === 'number');
              if (data.length === 0) return null;
              return (
                <div key={m.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-vq-text-hi">{m.label}</span>
                    <span className="text-vq-text-lo">
                      best: {internal.data!.best[m.key] ? '★' : '—'}
                    </span>
                  </div>
                  <BarChart data={data} format={(n) => fmt(m.key, n)} />
                </div>
              );
            })}
            <Recommendations recs={internal.data.recommendations} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeerCard() {
  const peers = usePeerBenchmark();
  const settings = useBenchmarkSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Industry peers (anonymized)</CardTitle>
      </CardHeader>
      <CardContent>
        {peers.isLoading ? (
          <LoadingCard rows={2} />
        ) : peers.isError ? (
          <ErrorState message={(peers.error as Error).message} onRetry={() => peers.refetch()} />
        ) : !peers.data ? (
          <EmptyState title="No peer data" hint="" />
        ) : !peers.data.available ? (
          <p className="text-sm text-vq-text-lo">
            {peers.data.reason === 'opt_in_required'
              ? 'Opt in above to see how you compare against anonymized industry peers.'
              : `Not enough opted-in peers in ${settings.data?.industry?.replace(/_/g, ' ') ?? 'your industry'} yet — peer data appears once at least 5 tenants have opted in (privacy protection). Currently ${peers.data.cohortSize}.`}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-vq-text-lo">
              Averaged over {peers.data.cohortSize} opted-in{' '}
              {peers.data.industry.replace(/_/g, ' ')} tenants.
            </p>
            {peers.data.metrics.map((pm) => {
              const meta = BENCHMARK_METRICS.find((m) => m.key === pm.key);
              return (
                <div key={pm.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-vq-text-hi">{meta?.label ?? pm.key}</span>
                    <span className="text-vq-text-lo">
                      you: {fmt(pm.key, pm.self)} · peer median: {fmt(pm.key, pm.peer.median)}
                    </span>
                  </div>
                  <PercentileBar percentile={pm.percentile} />
                </div>
              );
            })}
            <Recommendations recs={peers.data.recommendations} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PercentileBar({ percentile }: { percentile: number }) {
  const good = percentile >= 50;
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 flex-1 overflow-hidden rounded-vq-pill bg-vq-bg-base">
        <div
          className="vq-grow h-full rounded-vq-pill"
          style={{
            width: `${Math.max(2, percentile)}%`,
            background: good ? 'var(--vq-success)' : 'var(--vq-warn)',
          }}
        />
      </div>
      <span className="w-24 shrink-0 text-right font-mono text-vq-text-hi text-xs">
        {percentile.toFixed(0)}th pct
      </span>
    </div>
  );
}

function Recommendations({ recs }: { recs: BenchmarkRecommendation[] }) {
  if (recs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-vq-border border-t pt-3">
      <span className="flex items-center gap-1 text-vq-text-lo text-xs">
        <Lightbulb size={13} /> Recommendations
      </span>
      {recs.map((r) => (
        <p
          key={r.metric}
          className={`text-xs ${r.severity === 'warn' ? 'text-vq-warn' : 'text-vq-text-hi'}`}
        >
          {r.message}
        </p>
      ))}
    </div>
  );
}
