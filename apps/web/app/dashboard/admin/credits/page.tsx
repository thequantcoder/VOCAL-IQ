'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { CreditCard, Gift, Ticket } from 'lucide-react';
import { useState } from 'react';
import { type GrantKind, useCreatePromoCode, useGrantCredit } from '../../../../lib/api';

const KINDS: GrantKind[] = ['PROMO', 'BONUS', 'REFERRAL', 'MANUAL'];

/**
 * Super-admin promotional / bonus credits (PARITY-08): grant bonus credits directly to a tenant, or
 * mint a redeemable promo code. Both are audited server-side; grants are spent before paid credits
 * and never pay out as cash.
 */
export default function AdminCreditsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <CreditCard size={20} /> Credits & promos
        </h1>
        <p className="text-sm text-vq-text-lo">
          Grant bonus credits to a tenant or create a redeemable promo code. Both are audited;
          credits are spent before paid balance and never withdraw as cash.
        </p>
      </div>
      <GrantCard />
      <PromoCodeCard />
    </div>
  );
}

function GrantCard() {
  const grant = useGrantCredit();
  const [tenantId, setTenantId] = useState('');
  const [kind, setKind] = useState<GrantKind>('BONUS');
  const [dollars, setDollars] = useState(10);
  const [source, setSource] = useState('goodwill');
  const [expiresAt, setExpiresAt] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  function submit() {
    setMsg(null);
    grant.mutate(
      {
        tenantId: tenantId.trim(),
        kind,
        amountCents: Math.round(dollars * 100),
        source: source.trim() || 'manual',
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      },
      {
        onSuccess: (r) =>
          setMsg(`Granted ${r.remainingCents / 100} credits (grant ${r.id.slice(0, 8)}…) ✓`),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift size={16} /> Grant credits to a tenant
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field label="Tenant ID">
          <Input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </Field>
        <div className="flex gap-3">
          <Field label="Kind">
            <KindSelect value={kind} onChange={setKind} />
          </Field>
          <Field label="Amount ($)">
            <Input
              type="number"
              min={1}
              value={dollars}
              onChange={(e) => setDollars(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="flex gap-3">
          <Field label="Source / note">
            <Input value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>
          <Field label="Expires (optional)">
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            loading={grant.isPending}
            disabled={!tenantId.trim() || dollars <= 0}
            onClick={submit}
          >
            Grant credits
          </Button>
          {msg && <span className="text-vq-success text-sm">{msg}</span>}
          {grant.isError && (
            <span className="text-vq-danger text-sm">{(grant.error as Error).message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PromoCodeCard() {
  const create = useCreatePromoCode();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<GrantKind>('PROMO');
  const [dollars, setDollars] = useState(10);
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [perTenantLimit, setPerTenantLimit] = useState(1);
  const [expiresAt, setExpiresAt] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  function submit() {
    setMsg(null);
    create.mutate(
      {
        code: code.trim(),
        kind,
        amountCents: Math.round(dollars * 100),
        perTenantLimit,
        ...(maxRedemptions ? { maxRedemptions: Number(maxRedemptions) } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      },
      { onSuccess: (r) => setMsg(`Created code ${r.code} ✓`) },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket size={16} /> Create a promo code
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Field label="Code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LAUNCH50" />
          </Field>
          <Field label="Amount ($)">
            <Input
              type="number"
              min={1}
              value={dollars}
              onChange={(e) => setDollars(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="flex gap-3">
          <Field label="Kind">
            <KindSelect value={kind} onChange={setKind} />
          </Field>
          <Field label="Max redemptions (optional)">
            <Input
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="unlimited"
            />
          </Field>
        </div>
        <div className="flex gap-3">
          <Field label="Per-tenant limit">
            <Input
              type="number"
              min={1}
              value={perTenantLimit}
              onChange={(e) => setPerTenantLimit(Number(e.target.value))}
            />
          </Field>
          <Field label="Expires (optional)">
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={code.trim().length < 3 || dollars <= 0}
            onClick={submit}
          >
            Create code
          </Button>
          {msg && <span className="text-vq-success text-sm">{msg}</span>}
          {create.isError && (
            <span className="text-vq-danger text-sm">{(create.error as Error).message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <span className="font-medium text-sm text-vq-text-hi">{label}</span>
      {children}
    </div>
  );
}

function KindSelect({ value, onChange }: { value: GrantKind; onChange: (k: GrantKind) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as GrantKind)}
      className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi"
    >
      {KINDS.map((k) => (
        <option key={k} value={k}>
          {k.toLowerCase()}
        </option>
      ))}
    </select>
  );
}
