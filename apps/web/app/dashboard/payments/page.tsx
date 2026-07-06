'use client';

import { formatAmount } from '@vocaliq/shared';
import { Button, Card, CardContent } from '@vocaliq/ui';
import { CreditCard } from 'lucide-react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { type Payment, usePayments, useRefundPayment } from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'text-vq-success border-vq-success/40',
  authorized: 'text-vq-cyan border-vq-cyan/40',
  pending: 'text-vq-text-lo border-vq-border',
  failed: 'text-vq-danger border-vq-danger/40',
  refunded: 'text-vq-warn border-vq-warn/40',
  partially_refunded: 'text-vq-warn border-vq-warn/40',
};

/**
 * Payments (Day 78 — pay-by-voice). The list of card payments taken on calls. Card details are
 * captured by a PCI-compliant provider and never touch VocalIQ — only the amount, status, and the
 * last four digits are ever shown here.
 */
export default function PaymentsPage() {
  const payments = usePayments();
  const refund = useRefundPayment();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <CreditCard size={20} /> Payments
        </h1>
        <p className="text-sm text-vq-text-lo">
          Card payments taken over the phone. PCI-safe: the card is captured by a compliant provider
          — it never enters VocalIQ, the transcript, or the recording.
        </p>
      </div>

      {payments.isLoading ? (
        <LoadingCard rows={3} />
      ) : payments.isError ? (
        <ErrorState
          message={(payments.error as Error).message}
          onRetry={() => payments.refetch()}
        />
      ) : !payments.data || payments.data.length === 0 ? (
        <EmptyState
          title="No payments yet"
          hint="Add a Payment node to an agent flow to take payments on a call."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {payments.data.map((p) => (
            <PaymentRow
              key={p.id}
              p={p}
              onRefund={() => refund.mutate({ id: p.id })}
              refunding={refund.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentRow({
  p,
  onRefund,
  refunding,
}: { p: Payment; onRefund: () => void; refunding: boolean }) {
  const refundable =
    (p.status === 'succeeded' || p.status === 'partially_refunded') &&
    p.refundedCents < p.amountCents;
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3 text-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-vq-text-hi">
            {formatAmount(p.amountCents, p.currency)}
            <span
              className={`rounded-vq-pill border px-2 py-0.5 text-xs ${STATUS_COLOR[p.status] ?? ''}`}
            >
              {p.status.replace('_', ' ')}
            </span>
            {p.last4 && (
              <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                ···· {p.last4}
              </span>
            )}
          </span>
          <span className="text-vq-text-lo text-xs">
            {p.description || 'Payment'}
            {p.refundedCents > 0 && ` · refunded ${formatAmount(p.refundedCents, p.currency)}`}
            {p.providerRef && ` · ${p.providerRef}`}
          </span>
        </div>
        {refundable && (
          <Button size="sm" variant="ghost" disabled={refunding} onClick={onRefund}>
            Refund
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
