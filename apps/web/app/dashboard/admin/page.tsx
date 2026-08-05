'use client';

import { AgentAvatar, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { DonutBreakdown, StatCard } from '@vocaliq/ui/charts';
import { Stagger, StaggerItem } from '@vocaliq/ui/motion';
import {
  Activity,
  Building2,
  CreditCard,
  Download,
  Flag,
  KeyRound,
  Layers,
  Megaphone,
  Pause,
  Play,
  Rocket,
  Server,
  Shield,
  ShieldAlert,
  UserCog,
} from 'lucide-react';
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
  useLaunchReadiness,
  useScaleStatus,
  useSetAdminTenantStatus,
  useUpdateStatus,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

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
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Shield size={20} /> {t('Super-admin console')}
        </h1>
        <p className="text-sm text-vq-text-lo">
          {t('Platform-wide control plane — every tenant, all revenue, system health.')}
        </p>
      </div>

      <PlatformOverviewCards />
      <SystemHealthCard />
      <ReadinessCard />
      <ScaleCard />
      <VersionCard />
      <ToolHub />
      <TenantManager />
    </div>
  );
}

/** Self-host version + "Check for Updates" (PARITY-11) — reports only, never auto-applies. */
function VersionCard() {
  const { t } = useI18n();
  const status = useUpdateStatus();
  if (!status.data) return null;
  const s = status.data;
  const badge = !s.reachable
    ? { label: t("couldn't check"), cls: 'border-vq-border text-vq-text-lo' }
    : s.updateAvailable
      ? { label: t('update available'), cls: 'border-vq-warn/40 text-vq-warn' }
      : { label: t('up to date'), cls: 'border-vq-success/40 text-vq-success' };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Download size={16} /> {t('Version')}
          </span>
          <span className={`rounded-vq-pill border px-2 py-0.5 text-xs ${badge.cls}`}>
            {badge.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center gap-4">
          <Kv label={t('Installed')} value={s.current} />
          {s.latest && <Kv label={t('Latest')} value={s.latest} />}
        </div>
        {s.updateAvailable && (
          <>
            {s.belowMinCompatible && (
              <p className="text-vq-warn text-xs">
                {t(
                  'Your version is below the minimum for a direct upgrade — upgrade in steps (see notes).',
                )}
              </p>
            )}
            {s.notes && <p className="text-vq-text-lo text-xs">{s.notes}</p>}
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-vq-violet text-xs underline"
              >
                {t('View changelog & upgrade steps →')}
              </a>
            )}
          </>
        )}
        {!s.reachable && (
          <p className="text-vq-text-lo text-xs">
            {t('No release manifest configured/reachable — set')} <code>UPDATE_MANIFEST_URL</code>{' '}
            {t('to enable update checks.')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReadinessCard() {
  const { t } = useI18n();
  const readiness = useLaunchReadiness();
  if (!readiness.data) return null;
  const r = readiness.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Rocket size={16} /> {t('Launch readiness')}
          </span>
          <span
            className={`rounded-vq-pill border px-2 py-0.5 text-xs ${
              r.go ? 'border-vq-success/40 text-vq-success' : 'border-vq-danger/40 text-vq-danger'
            }`}
          >
            {r.go ? t('GO') : t('NO-GO · {n} blockers', { n: r.blockersFailed })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-vq-text-lo text-xs">
          {t('{passed}/{total} checks passing', { passed: r.passed, total: r.total })}
        </span>
        {r.results
          .filter((x) => !x.passed)
          .map((x) => (
            <div key={x.item.key} className="flex items-center gap-2 text-sm">
              <span className={x.item.severity === 'blocker' ? 'text-vq-danger' : 'text-vq-warn'}>
                ✗
              </span>
              <span className="text-vq-text-hi">{x.item.label}</span>
              {x.detail && <span className="text-vq-text-lo text-xs">— {x.detail}</span>}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function ScaleCard() {
  const { t } = useI18n();
  const scale = useScaleStatus();
  if (!scale.data) return null;
  const { backends, regions } = scale.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Server size={16} /> {t('Scale-out')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Kv label={t('Analytics')} value={backends.analytics} />
        <Kv label={t('Vectors')} value={backends.vectors} />
        <Kv
          label={t('Multi-region voice')}
          value={backends.multiRegionVoice ? t('on') : t('off')}
        />
        <Kv label={t('Voice regions')} value={regions.map((r) => r.id).join(', ')} />
      </CardContent>
    </Card>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-vq-text-lo text-xs">{label}</span>
      <span className="font-mono text-vq-text-hi text-sm">{value}</span>
    </div>
  );
}

function PlatformOverviewCards() {
  const { t } = useI18n();
  const period = currentPeriod();
  const overview = useAdminOverview(period);
  if (overview.isLoading) return <LoadingCard rows={1} />;
  if (overview.isError)
    return (
      <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} />
    );
  if (!overview.data) return null;
  const o = overview.data;
  const marginPct = Math.round(o.marginRate * 100);
  const mix = [
    { label: t('Active'), value: o.tenants.active, color: 'var(--success)' },
    { label: t('Trial'), value: o.tenants.trial, color: 'var(--info)' },
    { label: t('Suspended'), value: o.tenants.suspended, color: 'var(--danger)' },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-4">
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label={t('Gross revenue · {period}', { period })}
            value={o.grossRevenueCents / 100}
            format={formatUsd}
            sentiment="neutral"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t('Provider cost')}
            value={o.providerCostCents / 100}
            format={formatUsd}
            sentiment="neutral"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t('Total margin')}
            value={o.totalMarginCents / 100}
            format={formatUsd}
            delta={marginPct}
            sentiment="good"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t('Tenants')}
            value={o.tenants.total}
            icon={<Building2 size={15} />}
            sentiment="neutral"
          />
        </StaggerItem>
      </Stagger>

      {mix.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('Tenant mix')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutBreakdown data={mix} centerLabel={t('Tenants')} size={148} />
            <p className="mt-2 text-vq-text-lo text-xs">
              {t('{r} resellers · {c} customers', {
                r: o.tenants.resellers,
                c: o.tenants.customers,
              })}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const HEALTH_COLOR: Record<string, string> = {
  ok: 'text-vq-success border-vq-success/40',
  degraded: 'text-vq-warn border-vq-warn/40',
  down: 'text-vq-danger border-vq-danger/40',
};

function SystemHealthCard() {
  const { t } = useI18n();
  const health = useAdminHealth();
  if (!health.data) return null;
  const { overall, services } = health.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Activity size={16} /> {t('System health')}
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
  {
    href: '/dashboard/admin/governance',
    label: 'Governance',
    icon: Flag,
    hint: 'Flags, quotas, audit',
  },
  {
    href: '/dashboard/admin/fraud',
    label: 'Fraud & abuse',
    icon: ShieldAlert,
    hint: 'Auto-flagged tenants',
  },
  {
    href: '/dashboard/admin/announcements',
    label: 'Announcements',
    icon: Megaphone,
    hint: 'Broadcast to tenants',
  },
  {
    href: '/dashboard/admin/credits',
    label: 'Credits & promos',
    icon: CreditCard,
    hint: 'Grants + promo codes',
  },
] as const;

function ToolHub() {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TOOLS.map((tool) => (
        <Link key={tool.href} href={tool.href}>
          <Card className="transition-colors hover:border-vq-brand/50">
            <CardContent className="flex items-center gap-3 py-3">
              <tool.icon size={18} className="text-vq-brand" />
              <div className="flex flex-col">
                <span className="font-medium text-sm text-vq-text-hi">{t(tool.label)}</span>
                <span className="text-vq-text-lo text-xs">{t(tool.hint)}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function TenantManager() {
  const { t } = useI18n();
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
          <Building2 size={16} /> {t('Tenants')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={t('Search name or slug…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi"
          >
            <option value="">{t('All types')}</option>
            <option value="RESELLER">{t('Resellers')}</option>
            <option value="CUSTOMER">{t('Customers')}</option>
            <option value="PLATFORM">{t('Platform')}</option>
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
          <EmptyState title={t('No tenants match')} hint={t('Try a different search or filter.')} />
        ) : (
          <Stagger className="flex flex-col divide-y divide-vq-border">
            {tenants.data.items.map((tn) => (
              <StaggerItem key={tn.id}>
                <TenantRow tenant={tn} />
              </StaggerItem>
            ))}
          </Stagger>
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
  const { t } = useI18n();
  const setStatus = useSetAdminTenantStatus();
  const impersonate = useImpersonate();
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const suspended = tenant.status === 'SUSPENDED';
  const isPlatform = tenant.type === 'PLATFORM';

  async function doImpersonate() {
    const reason = window.prompt(t('Reason for impersonating (audited):'));
    if (!reason || reason.trim().length < 3) return;
    const grant = await impersonate.mutateAsync({ tenantId: tenant.id, reason: reason.trim() });
    setGrantMsg(
      t('Grant issued (expires in {min} min) — audited.', {
        min: Math.round(grant.expiresInSeconds / 60),
      }),
    );
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AgentAvatar seed={tenant.id} name={tenant.name} size={28} />
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
              <UserCog size={14} /> {t('Impersonate')}
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
                <Play size={14} /> {t('Reactivate')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: tenant.id, action: 'suspend' })}
              >
                <Pause size={14} /> {t('Suspend')}
              </Button>
            ))}
        </div>
      </div>
      {grantMsg && <span className="text-vq-success text-xs">{grantMsg}</span>}
    </div>
  );
}
