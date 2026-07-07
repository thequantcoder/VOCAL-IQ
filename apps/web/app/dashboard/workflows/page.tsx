'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Workflow } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  useCreateWorkflow,
  useDeleteWorkflow,
  useSetWorkflowStatus,
  useWorkflows,
} from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  draft: 'text-vq-text-lo border-vq-border',
  active: 'text-vq-success border-vq-success/40',
  paused: 'text-vq-warn border-vq-warn/40',
};

/**
 * Visual workflow automation (Day 85). List + create workflows; each opens a React Flow builder where
 * you wire trigger → conditions → actions → delays across systems. Active workflows fire on their event.
 */
export default function WorkflowsPage() {
  const workflows = useWorkflows();
  const create = useCreateWorkflow();
  const [name, setName] = useState('');

  async function submit() {
    if (name.trim().length === 0) return;
    await create.mutateAsync(name.trim());
    setName('');
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Workflow size={20} /> Workflows
        </h1>
        <p className="text-sm text-vq-text-lo">
          Automate whole business processes — trigger → conditions → actions (webhook, notify, task)
          → delays — with durable, observable runs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New workflow</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Post-call follow-up"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <Button
            size="sm"
            disabled={name.trim().length === 0 || create.isPending}
            onClick={submit}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </CardContent>
      </Card>

      {workflows.isLoading ? (
        <LoadingCard rows={3} />
      ) : workflows.isError ? (
        <ErrorState
          message={(workflows.error as Error).message}
          onRetry={() => workflows.refetch()}
        />
      ) : !workflows.data || workflows.data.length === 0 ? (
        <EmptyState title="No workflows yet" hint="Create one above to start automating." />
      ) : (
        <div className="flex flex-col gap-2">
          {workflows.data.map((wf) => (
            <WorkflowRow
              key={wf.id}
              id={wf.id}
              name={wf.name}
              status={wf.status}
              event={wf.triggerEvent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowRow({
  id,
  name,
  status,
  event,
}: {
  id: string;
  name: string;
  status: string;
  event: string | null;
}) {
  const setStatus = useSetWorkflowStatus(id);
  const del = useDeleteWorkflow();
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/dashboard/workflows/${id}`} className="text-vq-text-hi hover:underline">
            {name}
          </Link>
          <span className="flex items-center gap-2 text-vq-text-lo text-xs">
            <span className={`rounded-vq-pill border px-2 py-0.5 ${STATUS_COLOR[status] ?? ''}`}>
              {status}
            </span>
            {event ? `on ${event}` : 'no trigger yet'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/workflows/${id}`}
            className="rounded-vq border border-vq-border px-3 py-1.5 text-sm text-vq-text-hi hover:bg-vq-bg-base"
          >
            {status === 'active' ? 'Open' : 'Edit'}
          </Link>
          {status === 'active' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('paused')}
            >
              Pause
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={del.isPending} onClick={() => del.mutate(id)}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
