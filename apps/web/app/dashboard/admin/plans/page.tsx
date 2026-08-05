'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Archive, CloudUpload, Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import { formatUsd } from '../../../../components/ui-bits';
import {
  type PlanDto,
  type PlanInputBody,
  useArchivePlan,
  useCreatePlan,
  usePlans,
  useSyncPlan,
  useUpdatePlan,
} from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n/provider';

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

const EMPTY: PlanInputBody = {
  name: '',
  priceMonthly: 0,
  currency: 'USD',
  includedMinutes: 0,
  agentLimit: 1,
  numberLimit: 0,
  sipLimit: 0,
  overageRatePerMin: 0,
};

/**
 * No-code plan & pricing builder (Day 56): compose subscription tiers — price, included minutes,
 * limits, overage — with no code. Editing a subscribed plan's pricing forks a new version so
 * existing subscribers keep their terms; sync mirrors to Stripe (gated until keys are set).
 */
export default function PlansPage() {
  const { t } = useI18n();
  const plans = usePlans();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Layers size={20} /> {t('Plans & pricing')}
          </h1>
          <p className="text-sm text-vq-text-lo">
            {t('Build subscription tiers, limits, and overage rates — no code.')}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> {t('New plan')}
        </Button>
      </div>

      {creating && <PlanEditor onDone={() => setCreating(false)} />}

      {plans.isLoading ? (
        <LoadingCard rows={3} />
      ) : plans.isError ? (
        <ErrorState message={(plans.error as Error).message} onRetry={() => plans.refetch()} />
      ) : !plans.data || plans.data.length === 0 ? (
        <EmptyState title={t('No plans yet')} hint={t('Create your first subscription tier.')} />
      ) : (
        <div className="flex flex-col gap-3">
          {plans.data.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanRow({ plan }: { plan: PlanDto }) {
  const { t } = useI18n();
  const archive = useArchivePlan();
  const sync = useSyncPlan();
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function doSync() {
    const res = await sync.mutateAsync(plan.id);
    setMsg(
      res.synced
        ? t('Synced to Stripe.')
        : t('Stripe not configured — plan saved locally, will sync when keys are set.'),
    );
  }

  return (
    <Card className={plan.active ? '' : 'opacity-60'}>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-vq-text-hi">{plan.name}</span>
            <span className="text-vq-text-lo text-xs">v{plan.version}</span>
            <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
              {plan.tenantId ? t('reseller') : t('global')}
            </span>
            {!plan.active && (
              <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                {t('archived')}
              </span>
            )}
          </div>
          <span className="font-mono font-semibold text-vq-text-hi">
            {formatUsd(plan.priceMonthly / 100)}
            <span className="text-vq-text-lo text-xs">/mo</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-vq-text-lo text-xs">
          <span>{t('{n} min incl.', { n: plan.includedMinutes })}</span>
          <span>{t('{n} agents', { n: plan.agentLimit })}</span>
          <span>{t('{n} numbers', { n: plan.numberLimit })}</span>
          <span>{plan.sipLimit} SIP</span>
          <span>{t('overage {v}/min', { v: formatUsd(plan.overageRatePerMin / 100) })}</span>
        </div>
        {plan.active && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
              {t('Edit')}
            </Button>
            <Button size="sm" variant="ghost" disabled={sync.isPending} onClick={doSync}>
              <CloudUpload size={14} /> {t('Sync')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={archive.isPending}
              onClick={() => archive.mutate(plan.id)}
            >
              <Archive size={14} /> {t('Archive')}
            </Button>
          </div>
        )}
        {msg && <span className="text-vq-text-lo text-xs">{msg}</span>}
        {editing && <PlanEditor plan={plan} onDone={() => setEditing(false)} />}
      </CardContent>
    </Card>
  );
}

function PlanEditor({ plan, onDone }: { plan?: PlanDto; onDone: () => void }) {
  const { t } = useI18n();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const [form, setForm] = useState<PlanInputBody>(plan ? toForm(plan) : EMPTY);
  const [scope, setScope] = useState<'global' | 'own'>(plan?.tenantId ? 'own' : 'global');
  const busy = create.isPending || update.isPending;
  const err = (create.error ?? update.error) as Error | null;

  function set<K extends keyof PlanInputBody>(k: K, v: PlanInputBody[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.name.trim()) return;
    if (plan) await update.mutateAsync({ id: plan.id, body: form });
    else await create.mutateAsync({ ...form, scope });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {plan ? t('Edit {name}', { name: plan.name }) : t('New plan')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder={t('Plan name')}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field
            label={t('Price / mo (cents)')}
            value={form.priceMonthly}
            onChange={(v) => set('priceMonthly', v)}
          />
          <Field
            label={t('Included minutes')}
            value={form.includedMinutes}
            onChange={(v) => set('includedMinutes', v)}
          />
          <Field
            label={t('Overage /min (cents)')}
            value={form.overageRatePerMin}
            onChange={(v) => set('overageRatePerMin', v)}
          />
          <Field
            label={t('Agent limit')}
            value={form.agentLimit}
            onChange={(v) => set('agentLimit', v)}
          />
          <Field
            label={t('Number limit')}
            value={form.numberLimit}
            onChange={(v) => set('numberLimit', v)}
          />
          <Field
            label={t('SIP limit')}
            value={form.sipLimit}
            onChange={(v) => set('sipLimit', v)}
          />
        </div>
        {!plan && (
          <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
            {t('Scope')}
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'global' | 'own')}
              className={inputCls}
            >
              <option value="global">{t('Global (all tenants)')}</option>
              <option value="own">{t('My reseller only')}</option>
            </select>
          </label>
        )}
        {plan && (
          <p className="text-vq-text-lo text-xs">
            {t(
              'Changing pricing on a plan with active subscribers creates a new version — existing subscribers keep their current terms.',
            )}
          </p>
        )}
        {err && <p className="text-vq-danger text-xs">{err.message}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !form.name.trim()} onClick={submit}>
            {busy ? t('Saving…') : plan ? t('Save') : t('Create plan')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t('Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={inputCls}
      />
    </label>
  );
}

function toForm(p: PlanDto): PlanInputBody {
  return {
    name: p.name,
    priceMonthly: p.priceMonthly,
    currency: p.currency,
    includedMinutes: p.includedMinutes,
    agentLimit: p.agentLimit,
    numberLimit: p.numberLimit,
    sipLimit: p.sipLimit,
    overageRatePerMin: p.overageRatePerMin,
    features: p.features as Record<string, boolean | number | string>,
    isResellerPlan: p.isResellerPlan,
  };
}
