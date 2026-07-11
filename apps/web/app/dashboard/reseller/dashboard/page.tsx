'use client';

import { AgentAvatar, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { DonutBreakdown, Meter, RadialGauge, StatCard } from '@vocaliq/ui/charts';
import { Stagger, StaggerItem } from '@vocaliq/ui/motion';
import { ChevronRight, Percent, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import { formatUsd } from '../../../../components/ui-bits';
import {
  type ResellerClientMargin,
  type ResellerOverview,
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
        <RevenueOverview data={overview.data} />
      )}

      <MarkupCard />
    </div>
  );
}

/** Revenue + margin infographics — KPI cards, a margin gauge, a sub-tenant mix donut, and the table. */
function RevenueOverview({ data }: { data: ResellerOverview }) {
  const marginPct = Math.round(data.marginRate * 100);
  const mix = data.topClients.map((c) => ({
    label: c.name ?? c.childTenantId.slice(0, 8),
    value: c.revenueCents,
  }));
  return (
    <div className="flex flex-col gap-5">
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="Revenue"
            value={data.totalRevenueCents / 100}
            format={formatUsd}
            sentiment="neutral"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Provider cost"
            value={data.totalCostCents / 100}
            format={formatUsd}
            sentiment="neutral"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Margin"
            value={data.totalMarginCents / 100}
            format={formatUsd}
            sentiment="good"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Margin rate"
            value={marginPct}
            format={(v) => `${Math.round(v)}%`}
            sentiment={marginPct >= 30 ? 'good' : marginPct >= 15 ? 'neutral' : 'bad'}
          />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center gap-2 py-5">
          <RadialGauge value={marginPct} size={132} label="Margin rate" color="var(--success)" />
          <span className="text-vq-text-lo text-xs">Margin rate</span>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sub-tenant revenue mix</CardTitle>
          </CardHeader>
          <CardContent>
            {mix.length > 0 ? (
              <DonutBreakdown data={mix} centerLabel="Revenue" format={(v) => formatUsd(v / 100)} />
            ) : (
              <p className="text-sm text-vq-text-lo">No client revenue this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TopClients rows={data.topClients} />
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

function TopClients({ rows }: { rows: ResellerClientMargin[] }) {
  const top = Math.max(1, ...rows.map((c) => c.revenueCents));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top clients by revenue</CardTitle>
      </CardHeader>
      <CardContent>
        <Stagger className="flex flex-col divide-y divide-vq-border">
          {rows.map((c) => {
            const name = c.name ?? c.childTenantId.slice(0, 8);
            return (
              <StaggerItem key={c.childTenantId}>
                <div className="flex items-center gap-3 py-2.5 text-sm">
                  <AgentAvatar seed={c.childTenantId} name={name} size={28} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-vq-text-hi">{name}</span>
                      <span className="shrink-0 font-mono text-vq-text-lo text-xs">
                        {formatUsd(c.revenueCents / 100)}
                      </span>
                    </div>
                    <Meter
                      value={c.revenueCents}
                      max={top}
                      showValue={false}
                      className="[&>div]:h-1.5"
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-success text-xs">
                    +{formatUsd(c.marginCents / 100)}
                  </span>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
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
