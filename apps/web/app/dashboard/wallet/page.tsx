'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { CheckCircle2, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingCard } from '../../../components/states';
import { formatUsd } from '../../../components/ui-bits';
import { useMarginReconcile, useTopUp, useWalletDetail } from '../../../lib/api';

/** Wallet + margins (Day 53): prepaid balance reconciled to the ledger + reseller margin. */
export default function WalletPage() {
  const wallet = useWalletDetail();

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
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex flex-col gap-1">
                <span className="text-vq-text-lo text-xs">Balance</span>
                <span className="font-display font-semibold text-3xl text-vq-text-hi">
                  {formatUsd(wallet.data.balanceCents / 100)}
                </span>
                <span className="text-vq-text-lo text-xs">
                  {formatUsd(wallet.data.bonusCents / 100)} bonus · {wallet.data.currency}
                </span>
              </div>
              {wallet.data.reconciled && (
                <span
                  className="flex items-center gap-1.5 text-vq-success text-xs"
                  title="Cached balance ties out to the ledger sum"
                >
                  <CheckCircle2 size={14} /> Reconciled
                </span>
              )}
            </CardContent>
          </Card>
          <TopUpCard />
          <MarginCard />
        </>
      ) : null}
    </div>
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
