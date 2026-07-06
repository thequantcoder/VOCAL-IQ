'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Activity, Bell, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type NewSentimentRule,
  type SentimentAction,
  type SentimentMetric,
  type SentimentRule,
  useCreateSentimentRule,
  useDeleteSentimentRule,
  useSentimentEvents,
  useSentimentRules,
} from '../../../lib/api';

const METRICS: { value: SentimentMetric; label: string }[] = [
  { value: 'sentimentScore', label: 'Sentiment (−1…1)' },
  { value: 'anger', label: 'Anger (0…1)' },
  { value: 'frustration', label: 'Frustration (0…1)' },
  { value: 'buyingIntent', label: 'Buying intent (0…1)' },
];
const ACTIONS: { value: SentimentAction; label: string }[] = [
  { value: 'escalate', label: 'Escalate to a human' },
  { value: 'alert_supervisor', label: 'Alert a supervisor' },
  { value: 'tone_shift', label: 'Shift the agent tone' },
  { value: 'tag', label: 'Tag the call' },
  { value: 'pause', label: 'Pause the agent' },
];
const ACTION_COLOR: Record<SentimentAction, string> = {
  escalate: 'text-vq-danger border-vq-danger/40',
  alert_supervisor: 'text-vq-warn border-vq-warn/40',
  tone_shift: 'text-vq-accent border-vq-accent/40',
  tag: 'text-vq-text-lo border-vq-border',
  pause: 'text-vq-text-lo border-vq-border',
};
const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi';

/**
 * Live sentiment → action rules (Day 73). Operators define thresholds ("anger > 0.7 → escalate");
 * the live voice loop evaluates them each turn and dispatches — escalating to the Agent Desk,
 * alerting supervisors, or shifting tone — with a per-rule cooldown so alerts never storm. The
 * right column is the real-time supervisor feed of what has fired.
 */
export default function SentimentPage() {
  const rules = useSentimentRules();
  const events = useSentimentEvents();
  const create = useCreateSentimentRule();
  const del = useDeleteSentimentRule();

  const [draft, setDraft] = useState<NewSentimentRule>({
    metric: 'anger',
    operator: 'gt',
    threshold: 0.7,
    action: 'escalate',
    cooldownSec: 60,
  });

  const submit = () => {
    create.mutate(
      { ...draft, ...(draft.note ? { note: draft.note } : {}) },
      { onSuccess: () => setDraft((d) => ({ ...d, note: '' })) },
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Activity size={20} /> Live sentiment actions
        </h1>
        <p className="text-sm text-vq-text-lo">
          React to how a call feels — escalate angry callers, alert sales on buying intent, soften
          the tone when things sour. Rules fire in real time, with a cooldown so nothing spams.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        {/* Rules + builder */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap size={16} /> New rule
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-vq-text-lo">When</span>
                <select
                  aria-label="Metric"
                  className={SELECT_CLS}
                  value={draft.metric}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, metric: e.target.value as SentimentMetric }))
                  }
                >
                  {METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Operator"
                  className={SELECT_CLS}
                  value={draft.operator}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, operator: e.target.value as 'gt' | 'lt' }))
                  }
                >
                  <option value="gt">is above</option>
                  <option value="lt">is below</option>
                </select>
                <Input
                  aria-label="Threshold"
                  type="number"
                  step="0.05"
                  min={-1}
                  max={1}
                  className="w-24"
                  value={draft.threshold}
                  onChange={(e) => setDraft((d) => ({ ...d, threshold: Number(e.target.value) }))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-vq-text-lo">then</span>
                <select
                  aria-label="Action"
                  className={SELECT_CLS}
                  value={draft.action}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, action: e.target.value as SentimentAction }))
                  }
                >
                  {ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <span className="text-vq-text-lo">cooldown</span>
                <Input
                  aria-label="Cooldown seconds"
                  type="number"
                  min={1}
                  max={3600}
                  className="w-20"
                  value={draft.cooldownSec}
                  onChange={(e) => setDraft((d) => ({ ...d, cooldownSec: Number(e.target.value) }))}
                />
                <span className="text-vq-text-lo text-xs">sec</span>
              </div>
              <Input
                aria-label="Note"
                placeholder="Optional note for supervisors / tone hint…"
                value={draft.note ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
              {create.isError && (
                <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
              )}
              <Button size="sm" className="self-start" disabled={create.isPending} onClick={submit}>
                Add rule
              </Button>
            </CardContent>
          </Card>

          {rules.isLoading ? (
            <LoadingCard rows={3} />
          ) : rules.isError ? (
            <ErrorState message={(rules.error as Error).message} onRetry={() => rules.refetch()} />
          ) : !rules.data || rules.data.length === 0 ? (
            <EmptyState title="No rules yet" hint="Add your first sentiment trigger above." />
          ) : (
            <div className="flex flex-col gap-2">
              {rules.data.map((r) => (
                <RuleRow
                  key={r.id}
                  r={r}
                  onDelete={() => del.mutate(r.id)}
                  deleting={del.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live supervisor feed */}
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 font-medium text-sm text-vq-text-hi">
            <Bell size={15} /> Live alerts
          </h2>
          {events.isLoading ? (
            <LoadingCard rows={4} />
          ) : !events.data || events.data.length === 0 ? (
            <EmptyState title="Quiet for now" hint="Fired actions appear here in real time." />
          ) : (
            <div className="flex flex-col gap-2">
              {events.data.map((ev) => (
                <Card key={ev.id}>
                  <CardContent className="flex flex-col gap-1 py-3 text-xs">
                    <span
                      className={`w-fit rounded-vq-pill border px-2 py-0.5 ${ACTION_COLOR[ev.action]}`}
                    >
                      {ev.action.replace('_', ' ')}
                    </span>
                    <span className="text-vq-text-lo">
                      {ev.metric} {ev.value.toFixed(2)} · {new Date(ev.ts).toLocaleTimeString()}
                    </span>
                    <span className="font-mono text-[10px] text-vq-text-lo">
                      call {ev.callId.slice(0, 8)}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleRow({
  r,
  onDelete,
  deleting,
}: { r: SentimentRule; onDelete: () => void; deleting: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-vq-text-hi">
            <span className="font-mono">{r.metric}</span> {r.operator === 'gt' ? '>' : '<'}{' '}
            <span className="font-mono">{r.threshold}</span>{' '}
            <span className="text-vq-text-lo">→</span>{' '}
            <span
              className={`rounded-vq-pill border px-2 py-0.5 text-xs ${ACTION_COLOR[r.action]}`}
            >
              {r.action.replace('_', ' ')}
            </span>
          </span>
          <span className="text-vq-text-lo text-xs">
            cooldown {r.cooldownSec}s{r.note ? ` · ${r.note}` : ''}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={deleting}
          onClick={onDelete}
          aria-label="Delete rule"
        >
          <Trash2 size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}
