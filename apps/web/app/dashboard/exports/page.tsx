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
import { useI18n } from '../../../lib/i18n/provider';

const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi';

/**
 * BI analytics exports (Day 87). Generate on-demand CSV exports of calls/usage, download them, and set
 * up scheduled exports for a warehouse to pull. Programmatic access is via the scoped public API
 * (analytics:read; pii:read to un-mask). PII is masked by default.
 */
export default function ExportsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Database size={20} /> {t('Analytics exports')}
        </h1>
        <p className="text-sm text-vq-text-lo">
          {t(
            'Pipe your call/usage analytics into your BI — download CSVs, schedule exports, or pull via the API (GET /v1/analytics/calls, scope analytics:read). Phone numbers are masked unless the key holds pii:read.',
          )}
        </p>
      </div>

      <CreateExport />
      <ExportsList />
      <Schedules />
    </div>
  );
}

function CreateExport() {
  const { t } = useI18n();
  const create = useCreateExport();
  const [kind, setKind] = useState<'calls' | 'usage'>('calls');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('New export')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <select
          className={SELECT_CLS}
          value={kind}
          onChange={(e) => setKind(e.target.value as 'calls' | 'usage')}
        >
          <option value="calls">{t('Calls')}</option>
          <option value="usage">{t('Usage & cost')}</option>
        </select>
        <Button size="sm" disabled={create.isPending} onClick={() => create.mutate({ kind })}>
          {create.isPending ? t('Generating…') : t('Generate CSV')}
        </Button>
        <span className="text-vq-text-lo text-xs">{t('Phone numbers are masked in files.')}</span>
        {create.isError && (
          <p className="w-full text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ExportsList() {
  const { t } = useI18n();
  const exports = useExports();
  const download = useDownloadExport();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Recent exports')}</CardTitle>
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
          <EmptyState title={t('No exports yet')} hint={t('Generate one above.')} />
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {exports.data.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-vq-text-hi">{e.kind}</span>
                  <span className="text-vq-text-lo text-xs">
                    {t('{n} rows', { n: e.rowCount })} · {new Date(e.createdAt).toLocaleString()}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={download.isPending}
                  onClick={() => download.mutate({ id: e.id, kind: e.kind })}
                >
                  <Download size={14} /> {t('CSV')}
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
  const { t } = useI18n();
  const schedules = useExportSchedules();
  const create = useCreateExportSchedule();
  const toggle = useToggleExportSchedule();
  const del = useDeleteExportSchedule();
  const [kind, setKind] = useState<'calls' | 'usage'>('calls');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Scheduled exports')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={SELECT_CLS}
            value={kind}
            onChange={(e) => setKind(e.target.value as 'calls' | 'usage')}
          >
            <option value="calls">{t('Calls')}</option>
            <option value="usage">{t('Usage')}</option>
          </select>
          <select
            className={SELECT_CLS}
            value={cadence}
            onChange={(e) => setCadence(e.target.value as 'daily' | 'weekly')}
          >
            <option value="daily">{t('Daily')}</option>
            <option value="weekly">{t('Weekly')}</option>
          </select>
          <Button
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate({ kind, cadence })}
          >
            {t('Add schedule')}
          </Button>
        </div>
        {(schedules.data ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-vq-text-hi">
              {s.kind} · {s.cadence}
              <span className={`ml-2 text-xs ${s.active ? 'text-vq-success' : 'text-vq-text-lo'}`}>
                {s.active ? t('active') : t('paused')}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
              >
                {s.active ? t('Pause') : t('Resume')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={del.isPending}
                onClick={() => del.mutate(s.id)}
              >
                {t('Delete')}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
