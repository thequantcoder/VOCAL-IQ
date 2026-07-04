'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { ChevronRight, Percent, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import { formatUsd } from '../../../../components/ui-bits';
import {
  type ResellerClientMargin,
  useResellerMarkup,
  useResellerOverview,
  useSetResellerMarkup,
} from '../../../../lib/api';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Reseller portal dashboard (Day 54): revenue, margin, and top clients for a period, plus the
 * default retail markup. Every figure is RLS-scoped to the signed-in reseller — a sibling
 * reseller's numbers never reach here (self-audit B). The scope banner makes the
 * platform → reseller → customer position explicit (DESIGN-SYSTEM §5e).
 */
export default function ResellerDashboardPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const overview = useResellerOverview(period);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <TrendingUp size={20} /> Revenue & margin
        </h1>
        <ScopeBanner />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-vq-text-lo">Period</span>
        <Input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-40"
        />
      </div>

      {overview.isLoading ? (
        <LoadingCard rows={2} />
      ) : overview.isError ? (
        <ErrorState
          message={(overview.error as Error).message}
          onRetry={() => overview.refetch()}
        />
      ) : !overview.data || overview.data.clientCount === 0 ? (
        <EmptyState
          title="No billed usage this period"
          hint="Once your customers run calls, revenue and margin will roll up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Revenue" cents={overview.data.totalRevenueCents} />
            <Metric label="Provider cost" cents={overview.data.totalCostCents} />
            <Metric label="Margin" cents={overview.data.totalMarginCents} accent />
            <MetricRaw
              label="Margin rate"
              value={`${(overview.data.marginRate * 100).toFixed(1)}%`}
            />
          </div>
          <TopClients rows={overview.data.topClients} />
        </>
      )}

      <MarkupCard />
    </div>
  );
}

function ScopeBanner() {
  return (
    <div className="flex items-center gap-1 text-vq-text-lo text-xs">
      <span className="rounded-vq-pill bg-vq-surface-2 px-2 py-0.5">Platform</span>
      <ChevronRight size={12} />
      <span className="rounded-vq-pill border border-vq-brand/40 px-2 py-0.5 text-vq-brand">
        You (reseller)
      </span>
      <ChevronRight size={12} />
      <span className="rounded-vq-pill bg-vq-surface-2 px-2 py-0.5">Your customers</span>
    </div>
  );
}

function Metric({ label, cents, accent }: { label: string; cents: number; accent?: boolean }) {
  return <MetricRaw label={label} value={formatUsd(cents / 100)} accent={accent} />;
}

function MetricRaw({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-3">
        <span className="text-vq-text-lo text-xs">{label}</span>
        <span
          className={`font-mono font-semibold text-lg ${accent ? 'text-vq-success' : 'text-vq-text-hi'}`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function TopClients({ rows }: { rows: ResellerClientMargin[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top clients by revenue</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-vq-border">
        {rows.map((c) => (
          <div key={c.childTenantId} className="flex items-center justify-between py-2 text-sm">
            <span className="text-vq-text-hi">{c.name ?? c.childTenantId.slice(0, 8)}</span>
            <div className="flex items-center gap-6 font-mono">
              <span className="text-vq-text-lo">{formatUsd(c.revenueCents / 100)}</span>
              <span className="w-20 text-right text-vq-success">
                +{formatUsd(c.marginCents / 100)}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MarkupCard() {
  const markup = useResellerMarkup();
  const setMarkup = useSetResellerMarkup();
  const [pct, setPct] = useState<string>('');

  // Show the persisted value once loaded (bps → percent), unless the user is editing.
  const persistedPct = markup.data ? (markup.data.markupBps / 100).toString() : '';
  const value = pct === '' && !setMarkup.isPending ? persistedPct : pct;
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1000;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent size={16} /> Default markup
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-vq-text-lo text-sm">
          Applied on top of provider cost when billing your customers' usage. A 40% markup on a $1
          call charges the customer $1.40.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={1000}
            step={1}
            value={value}
            onChange={(e) => setPct(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-vq-text-lo">% markup</span>
          <Button
            size="sm"
            disabled={!valid || setMarkup.isPending}
            onClick={() => setMarkup.mutate(Math.round(parsed * 100))}
          >
            {setMarkup.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {setMarkup.isError && (
          <p className="text-vq-danger text-xs">{(setMarkup.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
