'use client';

import { formatAmount } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type BillableOutcome,
  type OutcomePrice,
  type OutcomeType,
  useDisputeOutcome,
  useOutcomePrices,
  useOutcomes,
  useSetOutcomePrice,
} from '../../../lib/api';

const TYPES: { type: OutcomeType; label: string; hint: string }[] = [
  {
    type: 'qualified_lead',
    label: 'Qualified lead',
    hint: 'billed when a lead reaches qualification',
  },
  { type: 'booking', label: 'Booking', hint: 'billed when an appointment is booked' },
  { type: 'payment', label: 'Payment', hint: 'billed on a successful payment' },
];
const STATUS_COLOR: Record<string, string> = {
  billed: 'text-vq-success border-vq-success/40',
  disputed: 'text-vq-warn border-vq-warn/40',
  refunded: 'text-vq-text-lo border-vq-border',
};

/**
 * Outcome-based billing (Day 82). Charge per verified business outcome — a qualified lead, a booking,
 * a payment — instead of (or alongside) per-minute. Set prices per outcome, and every billed outcome
 * is charged once, verified, and refundable on dispute.
 */
export default function OutcomesPage() {
  const prices = useOutcomePrices();
  const outcomes = useOutcomes();
  const dispute = useDisputeOutcome();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Target size={20} /> Outcome-based billing
        </h1>
        <p className="text-sm text-vq-text-lo">
          Sell on value: charge per qualified lead, booking, or payment. Each outcome is verified
          and billed at most once, refundable on dispute.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outcome pricing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {prices.isLoading ? (
            <LoadingCard rows={3} />
          ) : (
            TYPES.map((t) => (
              <PriceRow
                key={t.type}
                meta={t}
                current={prices.data?.find((p) => p.type === t.type)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billed outcomes</CardTitle>
        </CardHeader>
        <CardContent>
          {outcomes.isLoading ? (
            <LoadingCard rows={3} />
          ) : outcomes.isError ? (
            <ErrorState
              message={(outcomes.error as Error).message}
              onRetry={() => outcomes.refetch()}
            />
          ) : !outcomes.data || outcomes.data.length === 0 ? (
            <EmptyState
              title="No billed outcomes yet"
              hint="Record outcomes via the API or your flows."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {outcomes.data.map((o) => (
                <OutcomeRow
                  key={o.id}
                  o={o}
                  onDispute={() => dispute.mutate(o.id)}
                  disputing={dispute.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PriceRow({
  meta,
  current,
}: {
  meta: { type: OutcomeType; label: string; hint: string };
  current?: OutcomePrice;
}) {
  const save = useSetOutcomePrice();
  const [price, setPrice] = useState('');
  const [markup, setMarkup] = useState('0');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (current) {
      setPrice((current.priceCents / 100).toFixed(2));
      setMarkup(String(current.markupBps / 100));
      setActive(current.active);
    }
  }, [current]);

  return (
    <div className="flex flex-col gap-2 border-vq-border border-b pb-3 last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-vq-text-hi">{meta.label}</p>
          <p className="text-vq-text-lo text-xs">{meta.hint}</p>
        </div>
        <label className="flex items-center gap-2 text-vq-text-lo text-xs">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          active
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label
          htmlFor={`${meta.type}-price`}
          className="flex flex-col gap-1 text-vq-text-lo text-xs"
        >
          Price ($)
          <Input
            id={`${meta.type}-price`}
            type="number"
            min={0}
            step="0.01"
            className="w-28"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label
          htmlFor={`${meta.type}-markup`}
          className="flex flex-col gap-1 text-vq-text-lo text-xs"
        >
          Reseller markup (%)
          <Input
            id={`${meta.type}-markup`}
            type="number"
            min={0}
            className="w-28"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              type: meta.type,
              priceCents: Math.round(Number(price) * 100),
              markupBps: Math.round(Number(markup) * 100),
              active,
            })
          }
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function OutcomeRow({
  o,
  onDispute,
  disputing,
}: { o: BillableOutcome; onDispute: () => void; disputing: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 text-vq-text-hi">
          {formatAmount(o.retailCents, 'USD')}
          <span
            className={`rounded-vq-pill border px-2 py-0.5 text-xs ${STATUS_COLOR[o.status] ?? ''}`}
          >
            {o.status}
          </span>
          <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
            {o.type.replace('_', ' ')}
          </span>
        </span>
        <span className="truncate text-vq-text-lo text-xs">
          ref {o.refId.slice(0, 8)}
          {o.resellerMarginCents > 0 && ` · reseller ${formatAmount(o.resellerMarginCents, 'USD')}`}
        </span>
      </div>
      {o.status === 'billed' && (
        <Button size="sm" variant="ghost" disabled={disputing} onClick={onDispute}>
          Dispute
        </Button>
      )}
    </div>
  );
}
