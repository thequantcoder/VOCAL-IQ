'use client';

import {
  AgentAvatar,
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vocaliq/ui';
import { Sparkline } from '@vocaliq/ui/charts';
import { Crossfade, Stagger, StaggerItem } from '@vocaliq/ui/motion';
import { MoreHorizontal, Plus } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { StatusBadge } from '../../../components/ui-bits';
import { type AgentListItem, type CallListItem, useAgents, useCalls } from '../../../lib/api';

/** Per-agent daily call counts over the last 8 days (for the mini usage sparkline). */
function agentSparks(items: CallListItem[], days = 8): Record<string, number[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const map: Record<string, number[]> = {};
  for (const it of items) {
    const d = new Date(it.createdAt);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (diff < 0 || diff >= days) continue;
    let arr = map[it.agent.id];
    if (!arr) {
      arr = new Array<number>(days).fill(0);
      map[it.agent.id] = arr;
    }
    const idx = days - 1 - diff;
    arr[idx] = (arr[idx] ?? 0) + 1;
  }
  return map;
}

export default function AgentsPage() {
  const { data, isLoading, isError, error, refetch } = useAgents();
  const calls = useCalls();
  const sparks = agentSparks(calls.data?.items ?? []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
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

      <Crossfade
        swapKey={
          isLoading ? 'loading' : isError ? 'error' : !data || data.length === 0 ? 'empty' : 'data'
        }
      >
        {isLoading ? (
          <LoadingCard rows={3} />
        ) : isError ? (
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            illustration="no-agents"
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
          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((agent) => (
              <StaggerItem key={agent.id}>
                <AgentCard agent={agent} spark={sparks[agent.id]} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </Crossfade>
    </div>
  );
}

function AgentCard({ agent, spark }: { agent: AgentListItem; spark?: number[] }) {
  const callTotal = spark?.reduce((s, v) => s + v, 0) ?? 0;
  return (
    <Card className="vq-lift flex h-full flex-col gap-3 p-4 transition-colors hover:border-vq-violet/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar seed={agent.id} name={agent.name} size={40} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-vq-text-hi">{agent.name}</span>
            <span className="text-vq-text-lo text-xs">{agent.type.toLowerCase()}</span>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Channel / language chips. */}
      {agent.languages.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.languages.slice(0, 4).map((l) => (
            <Badge key={l} variant="neutral">
              {l}
            </Badge>
          ))}
          {agent.languages.length > 4 && (
            <Badge variant="outline">+{agent.languages.length - 4}</Badge>
          )}
        </div>
      )}

      {/* Mini usage sparkline. */}
      <div className="flex items-center justify-between border-vq-border border-t pt-3">
        <span className="text-vq-text-lo text-xs">
          <span className="font-medium text-vq-text-hi tabular-nums">{callTotal}</span> calls · 7d
        </span>
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} width={80} height={26} />
        ) : (
          <span className="text-vq-text-lo text-xs">No recent calls</span>
        )}
      </div>

      {/* Quick actions. */}
      <div className="mt-auto flex items-center gap-2">
        <Link href={`/dashboard/agents/${agent.id}/builder`} className="flex-1">
          <Button variant="secondary" size="sm" className="w-full">
            Build
          </Button>
        </Link>
        <Link href={`/dashboard/agents/${agent.id}/chat`} className="flex-1">
          <Button variant="ghost" size="sm" className="w-full">
            Chat
          </Button>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="More actions">
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/agents/${agent.id}/settings`}>Guards</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/agents/${agent.id}/learning`}>Learning</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/agents/${agent.id}/memory`}>Memory</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/agents/${agent.id}/tests`}>Tests</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
