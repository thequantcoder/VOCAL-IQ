'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Building2, Pause, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type SubTenant,
  useCreateSubTenant,
  useSetSubTenantStatus,
  useSubTenants,
} from '../../../lib/api';

/** Reseller console (Day 51): provision + manage your own isolated sub-tenants. */
export default function ResellerPage() {
  const subs = useSubTenants();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Building2 size={20} /> Sub-tenants
          </h1>
          <p className="text-sm text-vq-text-lo">
            Provision, suspend, and manage your customers — each fully isolated.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> New customer
        </Button>
      </div>

      {creating && <CreateSubTenant onDone={() => setCreating(false)} />}

      {subs.isLoading ? (
        <LoadingCard rows={3} />
      ) : subs.isError ? (
        <ErrorState message={(subs.error as Error).message} onRetry={() => subs.refetch()} />
      ) : !subs.data || subs.data.length === 0 ? (
        <EmptyState
          title="No customers yet"
          hint="Provision your first sub-tenant to get started."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {subs.data.map((s) => (
            <SubTenantRow key={s.id} sub={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubTenantRow({ sub }: { sub: SubTenant }) {
  const setStatus = useSetSubTenantStatus();
  const suspended = sub.status === 'SUSPENDED';
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${suspended ? 'text-vq-text-lo' : 'text-vq-text-hi'}`}>
              {sub.name}
            </span>
            <span
              className={`rounded-vq-pill border px-2 py-0.5 text-xs ${
                suspended
                  ? 'border-vq-danger/40 text-vq-danger'
                  : 'border-vq-success/40 text-vq-success'
              }`}
            >
              {sub.status.toLowerCase()}
            </span>
          </div>
          <span className="text-vq-text-lo text-xs">{sub.slug}</span>
        </div>
        {suspended ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: sub.id, action: 'reactivate' })}
          >
            <Play size={14} /> Reactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: sub.id, action: 'suspend' })}
          >
            <Pause size={14} /> Suspend
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSubTenant({ onDone }: { onDone: () => void }) {
  const create = useCreateSubTenant();
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  const valid = name.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail);

  async function submit() {
    if (!valid) return;
    await create.mutateAsync({ name: name.trim(), ownerEmail: ownerEmail.trim() });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New customer</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Customer / workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="Owner email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
        />
        <p className="text-vq-text-lo text-xs">
          The owner receives an invite to set their password. The workspace is isolated under your
          reseller account.
        </p>
        {create.isError && (
          <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? 'Provisioning…' : 'Create customer'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
