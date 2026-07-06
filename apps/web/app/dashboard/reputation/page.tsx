'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { type NumberHealth, useNumberHealth, useRefreshReputation } from '../../../lib/api';

const LABEL_COLOR: Record<string, string> = {
  clean: 'text-vq-success border-vq-success/40',
  at_risk: 'text-vq-warn border-vq-warn/40',
  flagged: 'text-vq-danger border-vq-danger/40',
};

/**
 * Number health / caller reputation (Day 69): each number's spam score + label, warm-up cap, and
 * rest state. Flagged numbers auto-rest to recover; refresh re-scores from recent behaviour + the
 * carrier spam label (gated provider). Protecting answer rates is existential for outbound.
 */
export default function ReputationPage() {
  const health = useNumberHealth();
  const refresh = useRefreshReputation();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <ShieldCheck size={20} /> Number health
        </h1>
        <p className="text-sm text-vq-text-lo">
          Caller reputation, STIR/SHAKEN, and warm-up — keep your numbers off "Scam Likely".
        </p>
      </div>

      {health.isLoading ? (
        <LoadingCard rows={3} />
      ) : health.isError ? (
        <ErrorState message={(health.error as Error).message} onRetry={() => health.refetch()} />
      ) : !health.data || health.data.length === 0 ? (
        <EmptyState title="No numbers yet" hint="Assign a number to see its reputation." />
      ) : (
        <div className="flex flex-col gap-3">
          {health.data.map((n) => (
            <Row
              key={n.id}
              n={n}
              onRefresh={() => refresh.mutate(n.id)}
              refreshing={refresh.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  n,
  onRefresh,
  refreshing,
}: { n: NumberHealth; onRefresh: () => void; refreshing: boolean }) {
  return (
    <Card className={n.rested ? 'opacity-70' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="font-mono text-vq-text-hi">{n.e164}</span>
          <span
            className={`rounded-vq-pill border px-2 py-0.5 text-xs ${LABEL_COLOR[n.label] ?? ''}`}
          >
            {n.label} · {n.score}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm">
        <div className="flex flex-wrap gap-x-4 text-vq-text-lo text-xs">
          <span>age {n.ageDays}d</span>
          <span>warm-up cap {n.warmupCapToday}/day</span>
          {n.rested && <span className="text-vq-danger">resting</span>}
        </div>
        <Button size="sm" variant="ghost" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={14} /> Re-score
        </Button>
      </CardContent>
    </Card>
  );
}
