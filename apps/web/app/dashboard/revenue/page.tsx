'use client';

import { formatAmount } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingCard } from '../../../components/states';
import {
  type AttributionRow,
  type RevenueDashboard,
  useAgents,
  useRecordRevenue,
  useRevenueDashboard,
} from '../../../lib/api';

const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi';
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

/**
 * Revenue attribution (Day 81). Ties calls to closed revenue: revenue + ROI per agent, per campaign,
 * per source, and the leads→calls→deals funnel — the numbers buyers care about, not just call counts.
 */
export default function RevenuePage() {
  const dash = useRevenueDashboard();
  const agents = useAgents();
  const agentName = (id: string) =>
    id === 'unattributed'
      ? 'Unattributed'
      : (agents.data?.find((a) => a.id === id)?.name ?? id.slice(0, 8));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <TrendingUp size={20} /> Revenue attribution
        </h1>
        <p className="text-sm text-vq-text-lo">
          Closed revenue attributed to agents, campaigns and sources — with ROI vs the metered cost
          of the calls. Last 30 days.
        </p>
      </div>

      <RecordRevenue />

      {dash.isLoading ? (
        <LoadingCard rows={4} />
      ) : dash.isError ? (
        <ErrorState message={(dash.error as Error).message} onRetry={() => dash.refetch()} />
      ) : dash.data ? (
        <Dashboard data={dash.data} agentName={agentName} />
      ) : null}
    </div>
  );
}

function Dashboard({
  data,
  agentName,
}: { data: RevenueDashboard; agentName: (id: string) => string }) {
  const t = data.totals;
  return (
    <div className="flex flex-col gap-6">
      {data.truncated && (
        <p className="rounded-vq border border-vq-warn/40 px-3 py-2 text-vq-warn text-xs">
          Showing a partial window — there are more revenue events than the dashboard aggregates at
          once; figures are a lower bound. Narrow the date range for exact numbers.
        </p>
      )}
      {/* Portfolio totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Revenue" value={formatAmount(t.revenueCents, 'USD')} />
        <Stat label="Cost" value={formatAmount(t.costCents, 'USD')} />
        <Stat
          label="Profit"
          value={formatAmount(t.profitCents, 'USD')}
          tone={t.profitCents >= 0 ? 'good' : 'bad'}
        />
        <Stat label="ROI" value={pct(t.roiPercent)} />
        <Stat label="Deals" value={String(t.deals)} />
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funnel</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.funnel.map((f) => (
            <div key={f.stage} className="flex items-center gap-3 text-sm">
              <span className="w-16 text-vq-text-lo capitalize">{f.stage}</span>
              <div className="h-4 flex-1 overflow-hidden rounded-vq bg-vq-bg-elevated">
                <div
                  className="h-full bg-vq-accent"
                  style={{ width: `${f.overallPercent ?? 100}%` }}
                />
              </div>
              <span className="w-24 text-right text-vq-text-hi">
                {f.count}
                {f.stepPercent !== null && (
                  <span className="text-vq-text-lo"> ({f.stepPercent}%)</span>
                )}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* By agent — full ROI */}
      <RoiTable title="By agent" rows={data.byAgent} label={agentName} showRoi />

      {/* By campaign — revenue attribution (campaign cost isn't call-linked) */}
      <RoiTable
        title="By campaign"
        rows={data.byCampaign}
        label={(id) => (id === 'unattributed' ? 'Unattributed' : id.slice(0, 8))}
        showRoi={false}
      />

      {/* By source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By source</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {data.bySource.length === 0 ? (
            <span className="text-vq-text-lo text-xs">No revenue recorded yet.</span>
          ) : (
            data.bySource.map((s) => (
              <div key={s.source} className="flex justify-between">
                <span className="text-vq-text-lo capitalize">{s.source}</span>
                <span className="text-vq-text-hi">
                  {formatAmount(s.revenueCents, 'USD')}{' '}
                  <span className="text-vq-text-lo">· {s.deals} deals</span>
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RoiTable({
  title,
  rows,
  label,
  showRoi,
}: {
  title: string;
  rows: AttributionRow[];
  label: (id: string) => string;
  showRoi: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <span className="text-vq-text-lo text-xs">No revenue in this window.</span>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex gap-2 border-vq-border border-b pb-1 text-vq-text-lo text-xs">
              <span className="flex-1">Name</span>
              <span className="w-24 text-right">Revenue</span>
              {showRoi && <span className="w-24 text-right">Cost</span>}
              {showRoi && <span className="w-16 text-right">ROI</span>}
              <span className="w-14 text-right">Deals</span>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-2">
                <span className="flex-1 truncate text-vq-text-hi">{label(r.key)}</span>
                <span className="w-24 text-right text-vq-text-hi">
                  {formatAmount(r.revenueCents, 'USD')}
                </span>
                {showRoi && (
                  <span className="w-24 text-right text-vq-text-lo">
                    {formatAmount(r.costCents, 'USD')}
                  </span>
                )}
                {showRoi && (
                  <span
                    className={`w-16 text-right ${r.profitCents >= 0 ? 'text-vq-success' : 'text-vq-danger'}`}
                  >
                    {pct(r.roiPercent)}
                  </span>
                )}
                <span className="w-14 text-right text-vq-text-lo">{r.deals}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color =
    tone === 'good' ? 'text-vq-success' : tone === 'bad' ? 'text-vq-danger' : 'text-vq-text-hi';
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-3">
        <span className="text-vq-text-lo text-xs">{label}</span>
        <span className={`font-semibold text-lg ${color}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

function RecordRevenue() {
  const record = useRecordRevenue();
  const agents = useAgents();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<'manual' | 'payment' | 'crm'>('manual');
  const [agentId, setAgentId] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents <= 0) return;
    await record.mutateAsync({
      amountCents: cents,
      source,
      ...(agentId ? { agentId } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setAmount('');
    setNote('');
    setOpen(false);
  }

  if (!open) {
    return (
      <Button size="sm" className="self-start" onClick={() => setOpen(true)}>
        Record revenue
      </Button>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Record revenue</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <label htmlFor="amt" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Amount (major units, e.g. 199.00)
            <Input
              id="amt"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label htmlFor="src" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Source
            <select
              id="src"
              className={SELECT_CLS}
              value={source}
              onChange={(e) => setSource(e.target.value as 'manual' | 'payment' | 'crm')}
            >
              <option value="manual">Manual</option>
              <option value="payment">Payment</option>
              <option value="crm">CRM</option>
            </select>
          </label>
          <label htmlFor="agt" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Agent (optional)
            <select
              id="agt"
              className={SELECT_CLS}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">—</option>
              {(agents.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {record.isError && (
          <p className="text-vq-danger text-xs">{(record.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!amount || record.isPending} onClick={submit}>
            {record.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
