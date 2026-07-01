'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { PhoneOutgoing } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { StatusBadge, formatDuration, formatUsd } from '../../../components/ui-bits';
import { useAgents, useCalls, usePlaceTestCall } from '../../../lib/api';

const fieldClass =
  'flex h-10 w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring focus-visible:border-vq-violet/60';

export default function CallsPage() {
  const calls = useCalls();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="font-display font-semibold text-xl text-vq-text-hi">Calls</h1>
        <p className="text-sm text-vq-text-lo">Place a test call and review transcripts + cost.</p>
      </header>

      <PlaceTestCall />

      {calls.isLoading ? (
        <LoadingCard rows={4} />
      ) : calls.isError ? (
        <ErrorState message={(calls.error as Error).message} onRetry={() => calls.refetch()} />
      ) : !calls.data || calls.data.items.length === 0 ? (
        <EmptyState title="No calls yet" hint="Place a test call above to see it here." />
      ) : (
        <div className="overflow-hidden rounded-vq-card border border-vq-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Recent calls</caption>
            <thead className="bg-vq-bg-elevated text-left text-vq-text-lo text-xs">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Agent
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Direction
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Duration
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {calls.data.items.map((c) => (
                <tr
                  key={c.id}
                  className="border-vq-border border-t transition-colors hover:bg-vq-bg-elevated"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/calls/${c.id}`}
                      className="focus-visible:outline-none focus-visible:underline"
                    >
                      <StatusBadge status={c.status} />
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-vq-text-hi">{c.agent.name}</td>
                  <td className="px-4 py-2 text-vq-text-lo">{c.direction.toLowerCase()}</td>
                  <td className="px-4 py-2 font-mono text-vq-text-lo text-xs">
                    {formatDuration(c.durationSec)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-vq-text-hi text-xs">
                    {formatUsd(c.costBreakdown?.billable ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlaceTestCall() {
  const agents = useAgents();
  const place = usePlaceTestCall();
  const [agentId, setAgentId] = useState('');
  const [to, setTo] = useState('');

  const effectiveAgent = agentId || agents.data?.[0]?.id || '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await place.mutateAsync({
      agentId: effectiveAgent,
      to: to.trim(),
      consentBasis: 'EXISTING_RELATIONSHIP',
    });
    setTo('');
  }

  const noAgents = !agents.isLoading && (agents.data?.length ?? 0) === 0;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Agent</span>
            <select
              className={fieldClass}
              value={effectiveAgent}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={noAgents}
            >
              {noAgents ? <option value="">No agents — create one first</option> : null}
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="test-to" className="flex flex-1 flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Destination</span>
            <Input
              id="test-to"
              type="tel"
              mono
              placeholder="+15551234567"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={place.isPending || noAgents || !to.trim() || !effectiveAgent}
          >
            <PhoneOutgoing size={16} /> {place.isPending ? 'Placing…' : 'Place test call'}
          </Button>
        </form>
        {place.isError ? (
          <p className={cn('mt-2 text-sm text-vq-danger')}>{(place.error as Error).message}</p>
        ) : null}
        {place.isSuccess ? (
          <p className="mt-2 text-sm text-vq-success">Call queued — it’ll appear below.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
