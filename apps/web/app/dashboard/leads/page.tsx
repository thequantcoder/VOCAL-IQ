'use client';

import { Card, CardContent } from '@vocaliq/ui';
import { KanbanSquare, Table2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { type LeadListItem, useLeads, useMoveLeadStage } from '../../../lib/api';

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'BOOKED', 'LOST'] as const;

const TEMP_STYLE: Record<string, string> = {
  HOT: 'text-vq-danger border-vq-danger/40 bg-vq-danger/10',
  WARM: 'text-vq-warn border-vq-warn/40 bg-vq-warn/10',
  COLD: 'text-vq-cyan border-vq-cyan/40 bg-vq-cyan/10',
};

/** Lead workspace (Day 29): scored pipeline as a table + kanban, filters URL-synced. */
export default function LeadsPage() {
  return (
    <Suspense fallback={<LoadingCard rows={4} />}>
      <LeadsWorkspace />
    </Suspense>
  );
}

function LeadsWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const view = params.get('view') === 'table' ? 'table' : 'kanban';
  const statusFilter = params.get('status') ?? '';
  const leads = useLeads(statusFilter ? { status: statusFilter } : {});

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/dashboard/leads?${next.toString()}`);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display font-semibold text-xl text-vq-text-hi">Leads</h1>
          <p className="text-sm text-vq-text-lo">
            Auto-scored pipeline from your calls. Drag cards to move stages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
            value={statusFilter}
            onChange={(e) => setParam('status', e.target.value)}
          >
            <option value="">All temperatures</option>
            <option value="HOT">Hot</option>
            <option value="WARM">Warm</option>
            <option value="COLD">Cold</option>
          </select>
          <button
            type="button"
            onClick={() => setParam('view', view === 'kanban' ? 'table' : 'kanban')}
            className="flex items-center gap-1 rounded-vq border border-vq-border px-3 py-1.5 text-sm text-vq-text-hi hover:border-vq-violet/60"
          >
            {view === 'kanban' ? <Table2 size={15} /> : <KanbanSquare size={15} />}
            {view === 'kanban' ? 'Table' : 'Kanban'}
          </button>
        </div>
      </div>

      {leads.isLoading ? (
        <LoadingCard rows={4} />
      ) : leads.isError ? (
        <ErrorState message={(leads.error as Error).message} onRetry={() => leads.refetch()} />
      ) : !leads.data || leads.data.length === 0 ? (
        <EmptyState
          illustration="no-leads"
          title="No leads yet"
          hint="Leads appear here after calls are scored."
        />
      ) : view === 'kanban' ? (
        <Kanban leads={leads.data} />
      ) : (
        <LeadTable leads={leads.data} />
      )}
    </div>
  );
}

function ScoreBadge({ lead }: { lead: LeadListItem }) {
  const style = TEMP_STYLE[lead.status] ?? 'text-vq-text-lo border-vq-border';
  return (
    <span className={`rounded-vq-pill border px-2 py-0.5 text-[11px] ${style}`}>
      {lead.status} · {lead.score}
    </span>
  );
}

function Kanban({ leads }: { leads: LeadListItem[] }) {
  const move = useMoveLeadStage();
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {STAGES.map((stage) => {
        const inStage = leads.filter((l) => (l.pipelineStage ?? 'NEW') === stage);
        return (
          <div
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) move.mutate({ id: dragId, stage });
              setDragId(null);
            }}
            className="flex min-h-40 flex-col gap-2 rounded-vq-card border border-vq-border bg-vq-bg-elevated/40 p-2"
          >
            <p className="px-1 text-xs text-vq-text-lo uppercase tracking-wide">
              {stage} · {inStage.length}
            </p>
            {inStage.map((lead) => (
              <div
                key={lead.id}
                draggable
                onDragStart={() => setDragId(lead.id)}
                className="cursor-grab rounded-vq border border-vq-border bg-vq-bg-base p-2 active:cursor-grabbing"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-sm text-vq-text-hi">
                    {lead.contactName ?? lead.phone ?? 'Unknown'}
                  </span>
                  <ScoreBadge lead={lead} />
                </div>
                {lead.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {lead.tags.map((t) => (
                      <span key={t} className="text-[10px] text-vq-text-lo">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function LeadTable({ leads }: { leads: LeadListItem[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <caption className="sr-only">Leads</caption>
          <thead>
            <tr className="border-vq-border border-b text-left text-vq-text-lo">
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Tags</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-vq-border/50 border-b last:border-0">
                <td className="px-4 py-3 text-vq-text-hi">{lead.contactName ?? '—'}</td>
                <td className="px-4 py-3 text-vq-text-lo">{lead.phone ?? '—'}</td>
                <td className="px-4 py-3 text-vq-text-lo">{lead.pipelineStage ?? 'NEW'}</td>
                <td className="px-4 py-3">
                  <ScoreBadge lead={lead} />
                </td>
                <td className="px-4 py-3 text-vq-text-lo">{lead.tags.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
