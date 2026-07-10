'use client';

import { AgentAvatar, Button, Card, CardContent, Input } from '@vocaliq/ui';
import { Crossfade } from '@vocaliq/ui/motion';
import { PhoneOutgoing } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { StatusBadge, formatDuration, formatUsd } from '../../../components/ui-bits';
import { useAgents, useCalls, usePlaceTestCall } from '../../../lib/api';
import { useActionFeedback } from '../../../lib/use-action-feedback';
import { useViewTransitionRouter } from '../../../lib/view-transitions';

/** A call link that navigates via the View Transitions API (shared-element morph) when supported. */
function CallLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useViewTransitionRouter();
  const href = `/dashboard/calls/${id}`;
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // Let the browser handle modified clicks (new tab, etc.); intercept the plain click for VT.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

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

      {/* Skeleton → content crossfade (UX-06): the loading placeholder fades into real data. */}
      <Crossfade
        swapKey={
          calls.isLoading
            ? 'loading'
            : calls.isError
              ? 'error'
              : !calls.data || calls.data.items.length === 0
                ? 'empty'
                : 'data'
        }
      >
        {calls.isLoading ? (
          <LoadingCard rows={4} />
        ) : calls.isError ? (
          <ErrorState message={(calls.error as Error).message} onRetry={() => calls.refetch()} />
        ) : !calls.data || calls.data.items.length === 0 ? (
          <EmptyState
            illustration="no-calls"
            title="No calls yet"
            hint="Place a test call above to see it here."
          />
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
                      <CallLink
                        id={c.id}
                        className="focus-visible:underline focus-visible:outline-none"
                      >
                        <StatusBadge status={c.status} />
                      </CallLink>
                    </td>
                    <td className="px-4 py-2">
                      <CallLink
                        id={c.id}
                        className="flex items-center gap-2 text-vq-text-hi focus-visible:underline focus-visible:outline-none"
                      >
                        {/* Shared element: this avatar morphs into the call-detail header avatar (View
                          Transitions API) when supported. */}
                        <span style={{ viewTransitionName: `vt-call-avatar-${c.id}` }}>
                          <AgentAvatar seed={c.agent.id} name={c.agent.name} size={28} />
                        </span>
                        {c.agent.name}
                      </CallLink>
                    </td>
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
      </Crossfade>
    </div>
  );
}

function PlaceTestCall() {
  const agents = useAgents();
  const place = usePlaceTestCall();
  const { run, pending, success } = useActionFeedback();
  const [agentId, setAgentId] = useState('');
  const [to, setTo] = useState('');

  const effectiveAgent = agentId || agents.data?.[0]?.id || '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Standardised pending → success/failure feedback + a first-call celebration.
    const result = await run(
      () =>
        place.mutateAsync({
          agentId: effectiveAgent,
          to: to.trim(),
          consentBasis: 'EXISTING_RELATIONSHIP',
        }),
      {
        success: 'Call queued — it’ll appear below.',
        milestone: {
          key: 'first-call',
          message: 'First call placed! 🎉',
          description: 'Watch it land in the list below.',
        },
      },
    );
    if (result) setTo('');
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
            loading={pending}
            success={success}
            disabled={noAgents || !to.trim() || !effectiveAgent}
          >
            <PhoneOutgoing size={16} /> Place test call
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
