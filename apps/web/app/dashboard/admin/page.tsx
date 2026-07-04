'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Activity, Building2, KeyRound, Layers, Pause, Play, Shield, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { formatUsd } from '../../../components/ui-bits';
import {
  type AdminTenantRow,
  type ServiceHealth,
  useAdminHealth,
  useAdminOverview,
  useAdminTenants,
  useImpersonate,
  useSetAdminTenantStatus,
} from '../../../lib/api';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Super-admin control plane (Day 55): the platform owner's view across ALL tenants — global
 * revenue/margin, system health, tenant management (suspend / audited impersonation), and the
 * hub to the other platform tools. Every panel is served by SUPER_ADMIN-gated endpoints.
 */
export default function SuperAdminPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Shield size={20} /> Super-admin console
        </h1>
        <p className="text-sm text-vq-text-lo">
          Platform-wide control plane — every tenant, all revenue, system health.
        </p>
      </div>

      <PlatformOverviewCards />
      <SystemHealthCard />
      <ToolHub />
      <TenantManager />
    </div>
  );
}

function PlatformOverviewCards() {
  const period = currentPeriod();
  const overview = useAdminOverview(period);
  if (overview.isLoading) return <LoadingCard rows={1} />;
  if (overview.isError)
    return (
      <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} />
    );
  if (!overview.data) return null;
  const o = overview.data;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Metric label={`Gross revenue · ${period}`} value={formatUsd(o.grossRevenueCents / 100)} />
      <Metric label="Provider cost" value={formatUsd(o.providerCostCents / 100)} />
      <Metric label="Total margin" value={formatUsd(o.totalMarginCents / 100)} accent />
      <Metric
        label="Tenants"
        value={`${o.tenants.total}`}
        sub={`${o.tenants.resellers} resellers · ${o.tenants.active} active`}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-3">
        <span className="text-vq-text-lo text-xs">{label}</span>
        <span
          className={`font-mono font-semibold text-lg ${accent ? 'text-vq-success' : 'text-vq-text-hi'}`}
        >
          {value}
        </span>
        {sub && <span className="text-vq-text-lo text-xs">{sub}</span>}
      </CardContent>
    </Card>
  );
}

const HEALTH_COLOR: Record<string, string> = {
  ok: 'text-vq-success border-vq-success/40',
  degraded: 'text-vq-warn border-vq-warn/40',
  down: 'text-vq-danger border-vq-danger/40',
};

function SystemHealthCard() {
  const health = useAdminHealth();
  if (!health.data) return null;
  const { overall, services } = health.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Activity size={16} /> System health
          </span>
          <span
            className={`rounded-vq-pill border px-2 py-0.5 text-xs ${HEALTH_COLOR[overall] ?? ''}`}
          >
            {overall}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {services.map((s: ServiceHealth) => (
          <div key={s.name} className="flex items-center justify-between text-sm">
            <span className="text-vq-text-hi capitalize">{s.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-vq-text-lo text-xs">{s.detail}</span>
              <span
                className={`rounded-vq-pill border px-2 py-0.5 text-xs ${HEALTH_COLOR[s.status] ?? ''}`}
              >
                {s.status}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const TOOLS = [
  {
    href: '/dashboard/admin/plans',
    label: 'Plans & pricing',
    icon: Layers,
    hint: 'No-code plan builder',
  },
  {
    href: '/dashboard/admin/vault',
    label: 'Key vault',
    icon: KeyRound,
    hint: 'Encrypted provider keys',
  },
  {
    href: '/dashboard/admin/key-pool',
    label: 'Key pool',
    icon: KeyRound,
    hint: 'Load-balanced keys',
  },
] as const;

function ToolHub() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TOOLS.map((t) => (
        <Link key={t.href} href={t.href}>
          <Card className="transition-colors hover:border-vq-brand/50">
            <CardContent className="flex items-center gap-3 py-3">
              <t.icon size={18} className="text-vq-brand" />
              <div className="flex flex-col">
                <span className="font-medium text-sm text-vq-text-hi">{t.label}</span>
                <span className="text-vq-text-lo text-xs">{t.hint}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function TenantManager() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const tenants = useAdminTenants({
    ...(query ? { query } : {}),
    ...(type ? { type } : {}),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 size={16} /> Tenants
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search name or slug…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi"
          >
            <option value="">All types</option>
            <option value="RESELLER">Resellers</option>
            <option value="CUSTOMER">Customers</option>
            <option value="PLATFORM">Platform</option>
          </select>
        </div>

        {tenants.isLoading ? (
          <LoadingCard rows={3} />
        ) : tenants.isError ? (
          <ErrorState
            message={(tenants.error as Error).message}
            onRetry={() => tenants.refetch()}
          />
        ) : !tenants.data || tenants.data.items.length === 0 ? (
          <EmptyState title="No tenants match" hint="Try a different search or filter." />
        ) : (
          <div className="flex flex-col divide-y divide-vq-border">
            {tenants.data.items.map((t) => (
              <TenantRow key={t.id} tenant={t} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'border-vq-success/40 text-vq-success',
  TRIAL: 'border-vq-brand/40 text-vq-brand',
  SUSPENDED: 'border-vq-danger/40 text-vq-danger',
  CANCELLED: 'border-vq-border text-vq-text-lo',
};

function TenantRow({ tenant }: { tenant: AdminTenantRow }) {
  const setStatus = useSetAdminTenantStatus();
  const impersonate = useImpersonate();
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const suspended = tenant.status === 'SUSPENDED';
  const isPlatform = tenant.type === 'PLATFORM';

  async function doImpersonate() {
    const reason = window.prompt('Reason for impersonating (audited):');
    if (!reason || reason.trim().length < 3) return;
    const grant = await impersonate.mutateAsync({ tenantId: tenant.id, reason: reason.trim() });
    setGrantMsg(
      `Grant issued (expires in ${Math.round(grant.expiresInSeconds / 60)} min) — audited.`,
    );
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-vq-text-hi">{tenant.name}</span>
          <span className="text-vq-text-lo text-xs">{tenant.type.toLowerCase()}</span>
          <span
            className={`rounded-vq-pill border px-2 py-0.5 text-xs ${STATUS_COLOR[tenant.status] ?? ''}`}
          >
            {tenant.status.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isPlatform && (
            <Button
              size="sm"
              variant="ghost"
              disabled={impersonate.isPending}
              onClick={doImpersonate}
            >
              <UserCog size={14} /> Impersonate
            </Button>
          )}
          {!isPlatform &&
            (suspended ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: tenant.id, action: 'reactivate' })}
              >
                <Play size={14} /> Reactivate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: tenant.id, action: 'suspend' })}
              >
                <Pause size={14} /> Suspend
              </Button>
            ))}
        </div>
      </div>
      {grantMsg && <span className="text-vq-success text-xs">{grantMsg}</span>}
    </div>
  );
}
