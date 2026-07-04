'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { LifeBuoy, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { formatUsd } from '../../../components/ui-bits';
import {
  type SupportTicket,
  type TicketStatus,
  useCreateTicket,
  useSetTicketStatus,
  useTickets,
  useWallet,
} from '../../../lib/api';

const NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus[]>> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['WAITING', 'RESOLVED', 'CLOSED'],
  WAITING: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
};

/** Support + credits (Day 49): in-platform ticketing and a wallet balance card. */
export default function SupportPage() {
  const tickets = useTickets();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <LifeBuoy size={20} /> Support
          </h1>
          <p className="text-sm text-vq-text-lo">In-platform tickets and your credit balance.</p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> New ticket
        </Button>
      </div>

      <WalletCard />
      {creating && <CreateTicket onDone={() => setCreating(false)} />}

      {tickets.isLoading ? (
        <LoadingCard rows={3} />
      ) : tickets.isError ? (
        <ErrorState message={(tickets.error as Error).message} onRetry={() => tickets.refetch()} />
      ) : !tickets.data || tickets.data.length === 0 ? (
        <EmptyState
          title="No tickets"
          hint="Open a ticket and our team (or your reseller) will help."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.data.map((t) => (
            <TicketRow key={t.id} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function WalletCard() {
  const wallet = useWallet();
  if (!wallet.data) return null;
  const low = wallet.data.totalCents < 500;
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <span className="flex items-center gap-2 text-sm text-vq-text-lo">
          <Wallet size={16} /> Credit balance
        </span>
        <div className="text-right">
          <span
            className={`font-mono font-semibold text-lg ${low ? 'text-vq-danger' : 'text-vq-text-hi'}`}
          >
            {formatUsd(wallet.data.totalCents / 100)}
          </span>
          <span className="block text-vq-text-lo text-xs">
            {formatUsd(wallet.data.bonusCents / 100)} bonus ·{' '}
            {formatUsd(wallet.data.prepaidCents / 100)} prepaid
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const setStatus = useSetTicketStatus();
  const options = NEXT_STATUS[ticket.status] ?? [];
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-vq-text-hi">{ticket.subject}</span>
          <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
            {ticket.status.toLowerCase()} · {ticket.priority.toLowerCase()}
          </span>
        </div>
        {ticket.body && <p className="text-sm text-vq-text-lo">{ticket.body}</p>}
        {options.length > 0 && (
          <div className="flex gap-1.5">
            {options.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="ghost"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: ticket.id, status: s })}
              >
                → {s.toLowerCase()}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateTicket({ onDone }: { onDone: () => void }) {
  const create = useCreateTicket();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('NORMAL');

  async function submit() {
    if (!subject.trim()) return;
    await create.mutateAsync({ subject: subject.trim(), body: body.trim(), priority });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New ticket</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Describe the issue…"
          className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi"
        />
        <label
          htmlFor="ticket-priority"
          className="flex items-center gap-2 text-vq-text-lo text-xs"
        >
          Priority
          <select
            id="ticket-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1 text-sm text-vq-text-hi"
          >
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        {create.isError && (
          <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!subject.trim() || create.isPending} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create ticket'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
