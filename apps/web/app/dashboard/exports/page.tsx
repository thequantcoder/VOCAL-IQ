'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Database, Download } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  useCreateExport,
  useCreateExportSchedule,
  useDeleteExportSchedule,
  useDownloadExport,
  useExportSchedules,
  useExports,
  useToggleExportSchedule,
} from '../../../lib/api';

const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi';

/**
 * BI analytics exports (Day 87). Generate on-demand CSV exports of calls/usage, download them, and set
 * up scheduled exports for a warehouse to pull. Programmatic access is via the scoped public API
 * (analytics:read; pii:read to un-mask). PII is masked by default.
 */
export default function ExportsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Database size={20} /> Analytics exports
        </h1>
        <p className="text-sm text-vq-text-lo">
          Pipe your call/usage analytics into your BI — download CSVs, schedule exports, or pull via
          the API (<code className="text-vq-text-hi text-xs">GET /v1/analytics/calls</code>, scope{' '}
          <code className="text-vq-text-hi text-xs">analytics:read</code>). Phone numbers are masked
          unless the key holds <code className="text-vq-text-hi text-xs">pii:read</code>.
        </p>
      </div>

      <CreateExport />
      <ExportsList />
      <Schedules />
    </div>
  );
}

function CreateExport() {
  const create = useCreateExport();
  const [kind, setKind] = useState<'calls' | 'usage'>('calls');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New export</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <select
          className={SELECT_CLS}
          value={kind}
          onChange={(e) => setKind(e.target.value as 'calls' | 'usage')}
        >
          <option value="calls">Calls</option>
          <option value="usage">Usage &amp; cost</option>
        </select>
        <Button size="sm" disabled={create.isPending} onClick={() => create.mutate({ kind })}>
          {create.isPending ? 'Generating…' : 'Generate CSV'}
        </Button>
        <span className="text-vq-text-lo text-xs">Phone numbers are masked in files.</span>
        {create.isError && (
          <p className="w-full text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ExportsList() {
  const exports = useExports();
  const download = useDownloadExport();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent exports</CardTitle>
      </CardHeader>
      <CardContent>
        {exports.isLoading ? (
          <LoadingCard rows={2} />
        ) : exports.isError ? (
          <ErrorState
            message={(exports.error as Error).message}
            onRetry={() => exports.refetch()}
          />
        ) : !exports.data || exports.data.length === 0 ? (
          <EmptyState title="No exports yet" hint="Generate one above." />
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {exports.data.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-vq-text-hi">{e.kind}</span>
                  <span className="text-vq-text-lo text-xs">
                    {e.rowCount} rows · {new Date(e.createdAt).toLocaleString()}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={download.isPending}
                  onClick={() => download.mutate({ id: e.id, kind: e.kind })}
                >
                  <Download size={14} /> CSV
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Schedules() {
  const schedules = useExportSchedules();
  const create = useCreateExportSchedule();
  const toggle = useToggleExportSchedule();
  const del = useDeleteExportSchedule();
  const [kind, setKind] = useState<'calls' | 'usage'>('calls');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scheduled exports</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={SELECT_CLS}
            value={kind}
            onChange={(e) => setKind(e.target.value as 'calls' | 'usage')}
          >
            <option value="calls">Calls</option>
            <option value="usage">Usage</option>
          </select>
          <select
            className={SELECT_CLS}
            value={cadence}
            onChange={(e) => setCadence(e.target.value as 'daily' | 'weekly')}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <Button
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate({ kind, cadence })}
          >
            Add schedule
          </Button>
        </div>
        {(schedules.data ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-vq-text-hi">
              {s.kind} · {s.cadence}
              <span className={`ml-2 text-xs ${s.active ? 'text-vq-success' : 'text-vq-text-lo'}`}>
                {s.active ? 'active' : 'paused'}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
              >
                {s.active ? 'Pause' : 'Resume'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={del.isPending}
                onClick={() => del.mutate(s.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
