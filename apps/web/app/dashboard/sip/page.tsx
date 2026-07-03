'use client';

import { SIP_PROVIDER_TEMPLATES, sipTemplate } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, cn } from '@vocaliq/ui';
import { ArrowDownLeft, ArrowUpRight, Lock, Plus, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type SipTrunkDto,
  useCreateSipTrunk,
  useDeleteSipTrunk,
  useSipTrunks,
  useUpdateSipTrunk,
} from '../../../lib/api';

/** BYO-SIP trunks (Day 35): connect your own carrier for inbound/outbound AI calls. */
export default function SipPage() {
  const trunks = useSipTrunks();
  const del = useDeleteSipTrunk();
  const update = useUpdateSipTrunk();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
            <Server size={20} /> SIP trunks
          </h1>
          <p className="text-sm text-vq-text-lo">
            Bring your own carrier. Credentials are encrypted at rest and never shown again.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> Add trunk
        </Button>
      </div>

      {creating && <AddTrunk onDone={() => setCreating(false)} />}

      {trunks.isLoading ? (
        <LoadingCard rows={3} />
      ) : trunks.isError ? (
        <ErrorState message={(trunks.error as Error).message} onRetry={() => trunks.refetch()} />
      ) : !trunks.data || trunks.data.length === 0 ? (
        <EmptyState title="No SIP trunks yet" hint="Connect your carrier to route AI calls." />
      ) : (
        <div className="flex flex-col gap-3">
          {trunks.data.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-vq-text-hi">
                    {t.name}{' '}
                    <span className="text-vq-text-lo text-xs">
                      · {sipTemplate(t.providerTemplate)?.label ?? t.providerTemplate}
                    </span>
                  </p>
                  <p className="font-mono text-vq-text-lo text-xs">
                    {t.transport} · {t.host}:{t.port} · <Lock size={11} className="inline" />{' '}
                    {t.authUsernameMasked || 'no creds'} · {t.concurrencyLimit} concurrent
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Inbound"
                    onClick={() => update.mutate({ id: t.id, body: { inbound: !t.inbound } })}
                    className={cn(
                      'flex items-center gap-1 rounded-vq-pill border px-2 py-0.5 text-xs',
                      t.inbound
                        ? 'border-vq-success/40 text-vq-success'
                        : 'border-vq-border text-vq-text-lo',
                    )}
                  >
                    <ArrowDownLeft size={12} /> in
                  </button>
                  <button
                    type="button"
                    title="Outbound"
                    onClick={() => update.mutate({ id: t.id, body: { outbound: !t.outbound } })}
                    className={cn(
                      'flex items-center gap-1 rounded-vq-pill border px-2 py-0.5 text-xs',
                      t.outbound
                        ? 'border-vq-success/40 text-vq-success'
                        : 'border-vq-border text-vq-text-lo',
                    )}
                  >
                    <ArrowUpRight size={12} /> out
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddTrunk({ onDone }: { onDone: () => void }) {
  const create = useCreateSipTrunk();
  const [providerTemplate, setProviderTemplate] = useState('twilio');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const tpl = sipTemplate(providerTemplate);
  const effectiveHost = host || tpl?.host || '';
  const canSubmit = name && authUsername && authPassword && effectiveHost && !create.isPending;

  async function submit() {
    await create.mutateAsync({
      providerTemplate,
      name,
      ...(host ? { host } : {}),
      inbound: true,
      outbound: true,
      concurrencyLimit: 10,
      credentials: { authUsername, authPassword },
    });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add SIP trunk</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label htmlFor="tpl" className="flex flex-col gap-1 text-xs text-vq-text-lo">
          Carrier
          <select
            id="tpl"
            className="rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi"
            value={providerTemplate}
            onChange={(e) => setProviderTemplate(e.target.value)}
          >
            {SIP_PROVIDER_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {tpl?.notes && <p className="text-xs text-vq-text-lo">{tpl.notes}</p>}
        <Input placeholder="Trunk name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder={tpl?.host ? `SIP host (default ${tpl.host})` : 'SIP host'}
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <Input
          placeholder="Auth username"
          value={authUsername}
          onChange={(e) => setAuthUsername(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Auth password / secret"
          value={authPassword}
          onChange={(e) => setAuthPassword(e.target.value)}
        />
        {create.isError && (
          <p className="text-xs text-vq-danger">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!canSubmit} onClick={submit}>
            {create.isPending ? 'Connecting…' : 'Add trunk'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
