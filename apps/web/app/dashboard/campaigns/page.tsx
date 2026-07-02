'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Megaphone, Pause, Play, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type CampaignListItem,
  useAgents,
  useCampaignMonitor,
  useCampaigns,
  useCreateCampaign,
  useImportContacts,
  useSetCampaignStatus,
} from '../../../lib/api';

/** Campaign manager (Day 28): create, import contacts, run/pause, and monitor live. */
export default function CampaignsPage() {
  const campaigns = useCampaigns();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
            <Megaphone size={20} /> Campaigns
          </h1>
          <p className="text-sm text-vq-text-lo">
            Bulk outbound with CSV import, DNC suppression, pacing + retries.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> New campaign
        </Button>
      </div>

      {creating && <CreateCampaign onDone={() => setCreating(false)} />}

      {campaigns.isLoading ? (
        <LoadingCard rows={3} />
      ) : campaigns.isError ? (
        <ErrorState
          message={(campaigns.error as Error).message}
          onRetry={() => campaigns.refetch()}
        />
      ) : !campaigns.data || campaigns.data.length === 0 ? (
        <EmptyState title="No campaigns yet" hint="Create one and import a contact list." />
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.data.map((c) => (
            <CampaignRow key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignListItem }) {
  const monitor = useCampaignMonitor(campaign.id);
  const setStatus = useSetCampaignStatus();
  const [importing, setImporting] = useState(false);
  const running = campaign.status === 'RUNNING';

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-vq-text-hi">{campaign.name}</p>
            <p className="text-xs text-vq-text-lo">
              {campaign.contactCount} contacts · {campaign.status}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setImporting((v) => !v)}>
              <Upload size={14} /> Import
            </Button>
            {running ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus.mutate({ id: campaign.id, status: 'PAUSED' })}
              >
                <Pause size={14} /> Pause
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStatus.mutate({ id: campaign.id, status: 'RUNNING' })}
              >
                <Play size={14} /> Run
              </Button>
            )}
          </div>
        </div>

        {monitor.data && monitor.data.total > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(monitor.data.byStatus).map(([status, count]) => (
              <span
                key={status}
                className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo"
              >
                {status.toLowerCase()}: {count}
              </span>
            ))}
          </div>
        )}

        {importing && <ImportPanel campaignId={campaign.id} onDone={() => setImporting(false)} />}
      </CardContent>
    </Card>
  );
}

function ImportPanel({ campaignId, onDone }: { campaignId: string; onDone: () => void }) {
  const doImport = useImportContacts(campaignId);
  const [csv, setCsv] = useState('phone,name,email\n');

  async function submit() {
    await doImport.mutateAsync({
      csv,
      mapping: { phone: 'phone', name: 'name', email: 'email' },
    });
  }

  return (
    <div className="flex flex-col gap-2 border-vq-border border-t pt-3">
      <p className="text-xs text-vq-text-lo">
        Paste CSV with a <code>phone</code> column (name/email optional). Duplicates + DNC are
        suppressed automatically.
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={5}
        className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 font-mono text-xs text-vq-text-hi"
      />
      {doImport.data && (
        <p className="text-xs text-vq-success">
          Imported {doImport.data.imported} · {doImport.data.duplicates} dup ·{' '}
          {doImport.data.suppressed} DNC · {doImport.data.invalid} invalid
        </p>
      )}
      {doImport.isError && (
        <p className="text-xs text-vq-danger">{(doImport.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={doImport.isPending} onClick={submit}>
          {doImport.isPending ? 'Importing…' : 'Import contacts'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}

function CreateCampaign({ onDone }: { onDone: () => void }) {
  const agents = useAgents();
  const create = useCreateCampaign();
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [pacing, setPacing] = useState(10);
  const [concurrency, setConcurrency] = useState(5);

  async function submit() {
    if (!name || !agentId) return;
    await create.mutateAsync({ name, agentId, pacing, concurrency });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New campaign</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
        <select
          className="rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">Select an agent…</option>
          {(agents.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="flex gap-3">
          <label htmlFor="pacing" className="flex flex-col gap-1 text-xs text-vq-text-lo">
            Pace / tick
            <Input
              id="pacing"
              type="number"
              value={pacing}
              onChange={(e) => setPacing(Number(e.target.value))}
            />
          </label>
          <label htmlFor="concurrency" className="flex flex-col gap-1 text-xs text-vq-text-lo">
            Concurrency
            <Input
              id="concurrency"
              type="number"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            />
          </label>
        </div>
        {create.isError && (
          <p className="text-xs text-vq-danger">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!name || !agentId || create.isPending} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create campaign'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
