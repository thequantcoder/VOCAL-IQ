'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Flag, Gauge, ScrollText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import {
  type FlagDto,
  useAuditLog,
  useGlobalFlags,
  useQuota,
  useRemoveFlag,
  useSetFlag,
  useTenantFlags,
} from '../../../../lib/api';

/**
 * Governance console (Day 58): feature flags (global + tenant), quota status, and the tamper-proof
 * audit log. Flag precedence is TENANT > PLAN > GLOBAL; the audit log is append-only.
 */
export default function GovernancePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Flag size={20} /> Governance
        </h1>
        <p className="text-sm text-vq-text-lo">
          Feature flags, quotas, and the tamper-proof audit log.
        </p>
      </div>

      <QuotaStrip />
      <Flags />
      <AuditViewer />
    </div>
  );
}

const RESOURCES = ['minutes', 'agents', 'numbers', 'sip'] as const;
const STATE_COLOR: Record<string, string> = {
  ok: 'text-vq-success',
  warn: 'text-vq-warn',
  over: 'text-vq-danger',
};

function QuotaStrip() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge size={16} /> Quota usage
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RESOURCES.map((r) => (
          <QuotaCell key={r} resource={r} />
        ))}
      </CardContent>
    </Card>
  );
}

function QuotaCell({ resource }: { resource: (typeof RESOURCES)[number] }) {
  const q = useQuota(resource);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-vq-text-lo text-xs capitalize">{resource}</span>
      {q.data ? (
        <>
          <span className={`font-mono font-semibold ${STATE_COLOR[q.data.state] ?? ''}`}>
            {q.data.used}
            <span className="text-vq-text-lo">/{q.data.limit || '∞'}</span>
          </span>
          <span className="text-vq-text-lo text-xs">{q.data.state}</span>
        </>
      ) : (
        <span className="text-vq-text-lo text-xs">…</span>
      )}
    </div>
  );
}

function Flags() {
  const globals = useGlobalFlags();
  const tenant = useTenantFlags();
  const setFlag = useSetFlag();
  const [key, setKey] = useState('');
  const [scope, setScope] = useState<'GLOBAL' | 'TENANT'>('TENANT');
  const [value, setValue] = useState(true);

  const valid = /^[a-z0-9][a-z0-9._-]*$/.test(key);
  const all: FlagDto[] = [...(globals.data ?? []), ...(tenant.data ?? [])];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag size={16} /> Feature flags
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="flag.key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="max-w-xs"
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'GLOBAL' | 'TENANT')}
            className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi"
          >
            <option value="TENANT">Tenant</option>
            <option value="GLOBAL">Global</option>
          </select>
          <label className="flex items-center gap-1 text-sm text-vq-text-lo">
            <input type="checkbox" checked={value} onChange={(e) => setValue(e.target.checked)} />
            on
          </label>
          <Button
            size="sm"
            disabled={!valid || setFlag.isPending}
            onClick={() => setFlag.mutate({ key, value, scope })}
          >
            Set flag
          </Button>
        </div>
        {all.length === 0 ? (
          <EmptyState title="No flags set" hint="Add a flag to gate a feature." />
        ) : (
          <div className="flex flex-col divide-y divide-vq-border">
            {all.map((f) => (
              <FlagRow key={`${f.scope}:${f.key}`} flag={f} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlagRow({ flag }: { flag: FlagDto }) {
  const remove = useRemoveFlag();
  const removable = flag.scope === 'GLOBAL' || flag.scope === 'TENANT';
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono text-vq-text-hi">{flag.key}</span>
        <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
          {flag.scope.toLowerCase()}
        </span>
        <span className="font-mono text-vq-text-lo text-xs">{String(flag.value)}</span>
      </div>
      {removable && (
        <Button
          size="sm"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => remove.mutate({ scope: flag.scope as 'GLOBAL' | 'TENANT', key: flag.key })}
        >
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );
}

function AuditViewer() {
  const [filter, setFilter] = useState('');
  const audit = useAuditLog(filter || undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText size={16} /> Audit log
          <span className="text-vq-text-lo text-xs">(append-only)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Filter by action (e.g. vault., superadmin., quota.)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        {audit.isLoading ? (
          <LoadingCard rows={3} />
        ) : audit.isError ? (
          <ErrorState message={(audit.error as Error).message} onRetry={() => audit.refetch()} />
        ) : !audit.data || audit.data.length === 0 ? (
          <EmptyState title="No audit entries" hint="Privileged actions will appear here." />
        ) : (
          <div className="flex flex-col divide-y divide-vq-border font-mono text-xs">
            {audit.data.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-vq-text-hi">{a.action}</span>
                <span className="truncate text-vq-text-lo">{a.target ?? '—'}</span>
                <span className="shrink-0 text-vq-text-lo">{new Date(a.ts).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
