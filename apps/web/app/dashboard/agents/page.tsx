'use client';

import { Button, Card } from '@vocaliq/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { StatusBadge } from '../../../components/ui-bits';
import { useAgents } from '../../../lib/api';

export default function AgentsPage() {
  const { data, isLoading, isError, error, refetch } = useAgents();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-xl text-vq-text-hi">Agents</h1>
          <p className="text-sm text-vq-text-lo">Prompt-based voice agents in this workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/agents/templates">
            <Button variant="secondary" size="sm">
              Templates
            </Button>
          </Link>
          <Link href="/dashboard/agents/new">
            <Button variant="primary" size="sm">
              <Plus size={16} /> New agent
            </Button>
          </Link>
        </div>
      </header>

      {isLoading ? (
        <LoadingCard rows={3} />
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No agents yet"
          hint="Create your first prompt-based agent to place a test call."
          action={
            <Link href="/dashboard/agents/new">
              <Button variant="primary" size="sm">
                <Plus size={16} /> Create an agent
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((agent) => (
            <li key={agent.id}>
              <Card className="flex flex-row items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-vq-text-hi">{agent.name}</span>
                  <span className="text-vq-text-lo text-xs">
                    {agent.type.toLowerCase()}
                    {agent.languages.length ? ` · ${agent.languages.join(', ')}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={agent.status} />
                  <Link href={`/dashboard/agents/${agent.id}/builder`}>
                    <Button variant="secondary" size="sm">
                      Build
                    </Button>
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
