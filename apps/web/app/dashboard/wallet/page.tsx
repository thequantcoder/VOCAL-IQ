'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Meter, Sparkline } from '@vocaliq/ui/charts';
import { CheckCircle2, Gift, Lock, Plus, Sparkles, Ticket, Wallet } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingCard } from '../../../components/states';
import { formatUsd } from '../../../components/ui-bits';
import {
  ADVANCED_FEATURE_LABELS,
  type BudgetStatus,
  type CallListItem,
  type CreditGrant,
  useBudget,
  useCalls,
  useMarginReconcile,
  useRedeemPromo,
  useSubscription,
  useTopUp,
  useWalletDetail,
  useWalletGrants,
} from '../../../lib/api';

/** Recent daily spend (billable) over the last `n` days, from the calls feed. */
function spendSeries(items: CallListItem[], n = 8): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Array<number>(n).fill(0);
  for (const it of items) {
    const d = new Date(it.createdAt);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (diff < 0 || diff >= n) continue;
    const idx = n - 1 - diff;
    buckets[idx] = (buckets[idx] ?? 0) + (it.costBreakdown?.billable ?? 0);
  }
  return buckets;
}

/** Wallet + margins (Day 53): prepaid balance reconciled to the ledger + reseller margin. */
export default function WalletPage() {
  const wallet = useWalletDetail();
  const calls = useCalls();
  const budget = useBudget();
  const spend = spendSeries(calls.data?.items ?? []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Wallet size={20} /> Wallet
        </h1>
        <p className="text-sm text-vq-text-lo">
          Prepaid credits drain per minute. Every charge is an idempotent ledger entry.
        </p>
      </div>

      {wallet.isLoading ? (
        <LoadingCard rows={2} />
      ) : wallet.isError ? (
        <ErrorState message={(wallet.error as Error).message} onRetry={() => wallet.refetch()} />
      ) : wallet.data ? (
        <>
          <Card className="relative isolate overflow-hidden before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-primary-500/12 before:to-accent-500/6">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex flex-col gap-1">
                <span className="text-vq-text-lo text-xs">Balance</span>
                <span className="font-display font-semibold text-3xl text-vq-text-hi">
                  {formatUsd(wallet.data.balanceCents / 100)}
                </span>
                <span className="text-vq-text-lo text-xs">
                  {wallet.data.promoCents > 0 && (
                    <span className="text-vq-brand">
                      +{formatUsd(wallet.data.promoCents / 100)} promo ·{' '}
                    </span>
                  )}
                  {formatUsd(wallet.data.bonusCents / 100)} bonus · {wallet.data.currency}
                </span>
              </div>
              <div className="flex flex-col items-end gap-2">
                {wallet.data.reconciled && (
                  <span
                    className="flex items-center gap-1.5 text-vq-success text-xs"
                    title="Cached balance ties out to the ledger sum"
                  >
                    <CheckCircle2 size={14} /> Reconciled
                  </span>
                )}
                {spend.some((v) => v > 0) && (
                  <div className="flex flex-col items-end gap-0.5">
                    <Sparkline data={spend} color="var(--viz-5)" width={110} height={32} />
                    <span className="text-vq-text-lo text-[0.7rem]">spend · 7d</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          {budget.data && <UsageCard budget={budget.data} />}
          <TopUpCard />
          <PromoCard />
          <MarginCard />
        </>
      ) : null}
      <AdvancedTierCard />
    </div>
  );
}

/** Promo / bonus credits (PARITY-08): redeem a code + list active/spent grants with expiry. */
function PromoCard() {
  const grants = useWalletGrants();
  const redeem = useRedeemPromo();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  function onRedeem() {
    setMsg(null);
    const c = code.trim();
    if (!c) return;
    redeem.mutate(c, {
      onSuccess: (r) => {
        setMsg(`Added ${formatUsd(r.amountCents / 100)} in promo credits ✓`);
        setCode('');
      },
    });
  }

  const rows = grants.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift size={16} /> Promotional credits
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Ticket size={15} className="text-vq-text-lo" />
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter a promo code"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && onRedeem()}
            />
            <Button
              size="sm"
              disabled={redeem.isPending || !code.trim()}
              onClick={onRedeem}
              loading={redeem.isPending}
            >
              Redeem
            </Button>
          </div>
          {msg && <span className="text-vq-success text-xs">{msg}</span>}
          {redeem.isError && (
            <span className="text-vq-danger text-xs">{(redeem.error as Error).message}</span>
          )}
          <p className="text-vq-text-lo text-xs">
            Promo credits are spent before your paid balance and never expire unless noted.
          </p>
        </div>

        {rows.length > 0 && (
          <ul className="flex flex-col divide-y divide-vq-border">
            {rows.map((g) => (
              <GrantRow key={g.id} grant={g} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function GrantRow({ grant }: { grant: CreditGrant }) {
  const expired = grant.expiresAt != null && new Date(grant.expiresAt).getTime() <= Date.now();
  const inactive = grant.revokedAt != null || expired || grant.remainingCents <= 0;
  const status = grant.revokedAt
    ? 'revoked'
    : expired
      ? 'expired'
      : grant.remainingCents <= 0
        ? 'spent'
        : 'active';

  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <div className="flex flex-col">
        <span className={inactive ? 'text-vq-text-lo line-through' : 'text-vq-text-hi'}>
          {formatUsd(grant.remainingCents / 100)}{' '}
          <span className="text-vq-text-lo text-xs">
            of {formatUsd(grant.amountCents / 100)} · {grant.source}
          </span>
        </span>
        {grant.expiresAt && (
          <span className="text-vq-text-lo text-[0.7rem]">
            {expired ? 'expired' : 'expires'} {new Date(grant.expiresAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <span
        className={`rounded-vq-pill border px-2 py-0.5 text-[0.7rem] ${
          status === 'active'
            ? 'border-vq-success/40 text-vq-success'
            : 'border-vq-border text-vq-text-lo'
        }`}
      >
        {status}
      </span>
    </li>
  );
}

/** Budget usage meters — today's + this month's spend vs their limits (UX-10c). */
function UsageCard({ budget }: { budget: BudgetStatus }) {
  // Derive the limit from spend ÷ pct (pct is the fraction of the cap used).
  const dailyMax =
    budget.dailyPct && budget.dailyPct > 0 ? budget.todaySpendUsd / budget.dailyPct : null;
  const monthlyMax =
    budget.monthlyPct && budget.monthlyPct > 0 ? budget.monthSpendUsd / budget.monthlyPct : null;

  if (dailyMax == null && monthlyMax == null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Budget usage</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {dailyMax != null && (
          <Meter
            label={`Today · ${formatUsd(budget.todaySpendUsd)}`}
            value={Math.round(budget.todaySpendUsd * 100)}
            max={Math.round(dailyMax * 100)}
            showValue={false}
          />
        )}
        {monthlyMax != null && (
          <Meter
            label={`This month · ${formatUsd(budget.monthSpendUsd)}`}
            value={Math.round(budget.monthSpendUsd * 100)}
            max={Math.round(monthlyMax * 100)}
            showValue={false}
          />
        )}
        {budget.anomaly && (
          <p className="text-vq-warn text-xs">Spend anomaly detected — review recent activity.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** The advanced-tier (Phase 6) feature entitlements for the current plan — Day 94. */
function AdvancedTierCard() {
  const sub = useSubscription();
  if (!sub.data) return null;
  const { planName, advancedFeatures } = sub.data.entitlements;
  const keys = Object.keys(ADVANCED_FEATURE_LABELS);
  const included = keys.filter((k) => advancedFeatures[k]).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles size={16} /> Advanced tier · {planName}
          <span className="text-vq-text-lo text-xs">
            {included}/{keys.length} features
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {keys.map((k) => {
          const on = advancedFeatures[k];
          const meta = ADVANCED_FEATURE_LABELS[k];
          return (
            <div
              key={k}
              className={`flex items-center gap-2 rounded-vq border px-2.5 py-1.5 text-xs ${
                on ? 'border-vq-border text-vq-text-hi' : 'border-vq-border/50 text-vq-text-lo'
              }`}
            >
              {on ? (
                <CheckCircle2 size={13} className="shrink-0 text-vq-success" />
              ) : (
                <Lock size={13} className="shrink-0 text-vq-text-lo" />
              )}
              <span className="truncate">{meta?.label ?? k}</span>
              {meta?.heavy && (
                <span className="ml-auto shrink-0 rounded-vq-pill border border-vq-border px-1.5 text-[10px] text-vq-text-lo">
                  premium
                </span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TopUpCard() {
  const topUp = useTopUp();
  const [dollars, setDollars] = useState(20);

  function add() {
    const cents = Math.round(dollars * 100);
    if (cents <= 0) return;
    // A stable idempotency key per intent so an accidental double-submit never double-credits.
    topUp.mutate({ amountCents: cents, key: `topup-${cents}-${Math.floor(Date.now() / 60000)}` });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add credits</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <span className="text-vq-text-lo">$</span>
        <Input
          type="number"
          min={1}
          value={dollars}
          onChange={(e) => setDollars(Number(e.target.value))}
          className="w-28"
        />
        <Button size="sm" disabled={topUp.isPending || dollars <= 0} onClick={add}>
          <Plus size={14} /> {topUp.isPending ? 'Adding…' : 'Top up'}
        </Button>
        {topUp.isError && (
          <span className="text-vq-danger text-xs">{(topUp.error as Error).message}</span>
        )}
      </CardContent>
    </Card>
  );
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function MarginCard() {
  const period = currentPeriod();
  const margin = useMarginReconcile(period);
  if (!margin.data || (margin.data.revenueCents === 0 && margin.data.costCents === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reseller margin · {period}</CardTitle>
      </CardHeader>
      <CardContent className="flex justify-between text-sm">
        <Stat label="Revenue" cents={margin.data.revenueCents} />
        <Stat label="Cost" cents={margin.data.costCents} />
        <Stat label="Margin" cents={margin.data.marginCents} accent />
      </CardContent>
    </Card>
  );
}

function Stat({ label, cents, accent }: { label: string; cents: number; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-vq-text-lo text-xs">{label}</span>
      <span className={`font-mono font-semibold ${accent ? 'text-vq-success' : 'text-vq-text-hi'}`}>
        {formatUsd(cents / 100)}
      </span>
    </div>
  );
}
