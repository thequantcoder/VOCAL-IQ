'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Bell, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type SignalAggregate,
  type SignalType,
  useCheckIntelAlerts,
  useIntelConfig,
  useIntelSignals,
  useIntelTrends,
  useSetIntelConfig,
} from '../../../lib/api';

const TYPE_META: Record<SignalType, { label: string; color: string; bar: string }> = {
  objection: { label: 'Objections', color: 'text-vq-warn', bar: 'bg-vq-warn/70' },
  buying_signal: { label: 'Buying signals', color: 'text-vq-success', bar: 'bg-vq-success/70' },
  competitor: { label: 'Competitor mentions', color: 'text-vq-danger', bar: 'bg-vq-danger/70' },
  feature_request: { label: 'Feature requests', color: 'text-vq-accent', bar: 'bg-vq-accent/70' },
  churn_risk: { label: 'Churn risk', color: 'text-vq-danger', bar: 'bg-vq-danger/70' },
};
const TYPES: SignalType[] = [
  'competitor',
  'objection',
  'buying_signal',
  'feature_request',
  'churn_risk',
];

/**
 * Conversation Intelligence (Day 75): every call mined for business signal — objections, buying
 * signals, competitor mentions, feature requests, churn risk — trended across the tenant and
 * alertable at thresholds. Extraction is deterministic (no added LLM spend); this is the dashboard.
 */
export default function IntelPage() {
  const trends = useIntelTrends(30);
  const config = useIntelConfig();
  const setConfig = useSetIntelConfig();
  const checkAlerts = useCheckIntelAlerts();
  const [competitor, setCompetitor] = useState('');

  const byType = (t: SignalType): SignalAggregate[] =>
    (trends.data ?? []).filter((s) => s.type === t);
  const competitors = config.data?.competitors ?? [];

  const addCompetitor = () => {
    const name = competitor.trim();
    if (!name || competitors.includes(name)) return;
    setConfig.mutate({
      competitors: [...competitors, name],
      alertRules: config.data?.alertRules ?? [],
    });
    setCompetitor('');
  };
  const removeCompetitor = (name: string) => {
    setConfig.mutate({
      competitors: competitors.filter((c) => c !== name),
      alertRules: config.data?.alertRules ?? [],
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Lightbulb size={20} /> Conversation intelligence
          </h1>
          <p className="text-sm text-vq-text-lo">
            What your callers are really telling you — objections, buying signals, competitors, and
            churn risk, trended across every call. Last 30 days.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={checkAlerts.isPending}
          onClick={() => checkAlerts.mutate()}
        >
          <Bell size={14} /> Check alerts
        </Button>
      </div>

      {checkAlerts.data && (
        <p className="text-sm text-vq-text-lo">
          {checkAlerts.data.fired.length === 0
            ? 'No thresholds breached.'
            : `${checkAlerts.data.fired.length} alert(s) fired: ${checkAlerts.data.fired
                .map((f) => `${f.label} (${f.count})`)
                .join(', ')}`}
        </p>
      )}

      {/* Trends */}
      {trends.isLoading ? (
        <LoadingCard rows={4} />
      ) : trends.isError ? (
        <ErrorState message={(trends.error as Error).message} onRetry={() => trends.refetch()} />
      ) : (trends.data ?? []).length === 0 ? (
        <EmptyState title="No signals yet" hint="Signals appear here as calls are analysed." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {TYPES.map((t) => {
            const rows = byType(t);
            if (rows.length === 0) return null;
            const max = Math.max(...rows.map((r) => r.count));
            return (
              <Card key={t}>
                <CardHeader>
                  <CardTitle className={`text-base ${TYPE_META[t].color}`}>
                    {TYPE_META[t].label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {rows.slice(0, 6).map((r) => (
                    <div key={r.label} className="flex items-center gap-2 text-sm">
                      <span className="w-32 shrink-0 truncate text-vq-text-hi" title={r.label}>
                        {r.label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-vq-pill bg-vq-surface">
                        <div
                          className={`h-full rounded-vq-pill ${TYPE_META[t].bar}`}
                          style={{ width: `${Math.round((r.count / max) * 100)}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-vq-text-lo tabular-nums">{r.count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Competitor watchlist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Competitor watchlist</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-vq-text-lo text-xs">
            Add the competitors you want tracked — each mention across calls is trended above and
            can be alerted on.
          </p>
          <div className="flex flex-wrap gap-2">
            {competitors.map((c) => (
              <span
                key={c}
                className="flex items-center gap-1 rounded-vq-pill border border-vq-border px-2 py-0.5 text-sm text-vq-text-hi"
              >
                {c}
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  onClick={() => removeCompetitor(c)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {competitors.length === 0 && (
              <span className="text-vq-text-lo text-sm">No competitors tracked yet.</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Competitor name"
              placeholder="e.g. Acme"
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCompetitor();
              }}
            />
            <Button size="sm" disabled={setConfig.isPending} onClick={addCompetitor}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <SignalExplorer />
    </div>
  );
}

/** A filterable list of the raw mined signals — the drill-down feeding coaching + product. */
function SignalExplorer() {
  const [type, setType] = useState<string>('');
  const signals = useIntelSignals(type ? { type } : {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Signal explorer</span>
          <select
            aria-label="Filter by type"
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1 text-sm text-vq-text-hi"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].label}
              </option>
            ))}
          </select>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {signals.isLoading ? (
          <LoadingCard rows={3} />
        ) : !signals.data || signals.data.length === 0 ? (
          <EmptyState title="No signals" hint="Mined signals will show here." />
        ) : (
          <div className="flex flex-col divide-y divide-vq-border">
            {signals.data.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 ${TYPE_META[s.type]?.color ?? ''}`}>{s.label}</span>
                  {s.quote && <span className="truncate text-vq-text-lo text-xs">“{s.quote}”</span>}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-vq-text-lo">
                  {s.callId.slice(0, 8)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
