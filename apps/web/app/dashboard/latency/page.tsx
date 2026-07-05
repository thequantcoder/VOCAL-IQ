'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Gauge } from 'lucide-react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { type LatencyStat, useLatencySummary } from '../../../lib/api';

const STAGE_LABEL: Record<string, string> = {
  stt: 'Speech-to-text',
  llmTtft: 'LLM (first token)',
  ttsTtfa: 'TTS (first audio)',
  network: 'Network',
  total: 'End-to-end turn',
};

/**
 * Voice-loop latency dashboard (Day 63): p50/p95 per stage against the SLO, over a trailing
 * window. A breached stage (p95 over budget) is flagged red so regressions surface immediately.
 */
export default function LatencyPage() {
  const summary = useLatencySummary(24);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Gauge size={20} /> Voice latency
        </h1>
        <p className="text-sm text-vq-text-lo">
          Per-stage p50 / p95 vs SLO over the last 24h. Lower is snappier.
        </p>
      </div>

      {summary.isLoading ? (
        <LoadingCard rows={4} />
      ) : summary.isError ? (
        <ErrorState message={(summary.error as Error).message} onRetry={() => summary.refetch()} />
      ) : !summary.data || summary.data.count === 0 ? (
        <EmptyState
          title="No latency samples yet"
          hint="Once calls run, per-turn latency will chart here."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{summary.data.count} turns</span>
              <span
                className={`rounded-vq-pill border px-2 py-0.5 text-xs ${
                  summary.data.breached
                    ? 'border-vq-danger/40 text-vq-danger'
                    : 'border-vq-success/40 text-vq-success'
                }`}
              >
                {summary.data.breached ? 'SLO breached' : 'within SLO'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-vq-border">
            {summary.data.stats.map((s) => (
              <StatRow key={s.stage} stat={s} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatRow({ stat }: { stat: LatencyStat }) {
  const pct = Math.min(100, Math.round((stat.p95 / stat.slo) * 100));
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-vq-text-hi">{STAGE_LABEL[stat.stage] ?? stat.stage}</span>
        <span className="font-mono text-vq-text-lo text-xs">
          p50 {stat.p50}ms · p95{' '}
          <span className={stat.breached ? 'text-vq-danger' : 'text-vq-text-hi'}>{stat.p95}ms</span>{' '}
          / SLO {stat.slo}ms
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-vq-pill bg-vq-surface-2">
        <div
          className={`h-full ${stat.breached ? 'bg-vq-danger' : 'bg-vq-success'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
