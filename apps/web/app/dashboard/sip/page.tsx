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
import { useI18n } from '../../../lib/i18n/provider';

/** BYO-SIP trunks (Day 35): connect your own carrier for inbound/outbound AI calls. */
export default function SipPage() {
  const { t } = useI18n();
  const trunks = useSipTrunks();
  const del = useDeleteSipTrunk();
  const update = useUpdateSipTrunk();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
            <Server size={20} /> {t('SIP trunks')}
          </h1>
          <p className="text-sm text-vq-text-lo">
            {t('Bring your own carrier. Credentials are encrypted at rest and never shown again.')}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> {t('Add trunk')}
        </Button>
      </div>

      {creating && <AddTrunk onDone={() => setCreating(false)} />}

      {trunks.isLoading ? (
        <LoadingCard rows={3} />
      ) : trunks.isError ? (
        <ErrorState message={(trunks.error as Error).message} onRetry={() => trunks.refetch()} />
      ) : !trunks.data || trunks.data.length === 0 ? (
        <EmptyState
          title={t('No SIP trunks yet')}
          hint={t('Connect your carrier to route AI calls.')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {trunks.data.map((tr) => (
            <Card key={tr.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-vq-text-hi">
                    {tr.name}{' '}
                    <span className="text-vq-text-lo text-xs">
                      · {sipTemplate(tr.providerTemplate)?.label ?? tr.providerTemplate}
                    </span>
                  </p>
                  <p className="font-mono text-vq-text-lo text-xs">
                    {tr.transport} · {tr.host}:{tr.port} · <Lock size={11} className="inline" />{' '}
                    {tr.authUsernameMasked || t('no creds')} ·{' '}
                    {t('{n} concurrent', { n: tr.concurrencyLimit })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title={t('Inbound')}
                    onClick={() => update.mutate({ id: tr.id, body: { inbound: !tr.inbound } })}
                    className={cn(
                      'flex items-center gap-1 rounded-vq-pill border px-2 py-0.5 text-xs',
                      tr.inbound
                        ? 'border-vq-success/40 text-vq-success'
                        : 'border-vq-border text-vq-text-lo',
                    )}
                  >
                    <ArrowDownLeft size={12} /> {t('in')}
                  </button>
                  <button
                    type="button"
                    title={t('Outbound')}
                    onClick={() => update.mutate({ id: tr.id, body: { outbound: !tr.outbound } })}
                    className={cn(
                      'flex items-center gap-1 rounded-vq-pill border px-2 py-0.5 text-xs',
                      tr.outbound
                        ? 'border-vq-success/40 text-vq-success'
                        : 'border-vq-border text-vq-text-lo',
                    )}
                  >
                    <ArrowUpRight size={12} /> {t('out')}
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(tr.id)}>
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
  const { t } = useI18n();
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
        <CardTitle className="text-base">{t('Add SIP trunk')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label htmlFor="tpl" className="flex flex-col gap-1 text-xs text-vq-text-lo">
          {t('Carrier')}
          <select
            id="tpl"
            className="rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi"
            value={providerTemplate}
            onChange={(e) => setProviderTemplate(e.target.value)}
          >
            {SIP_PROVIDER_TEMPLATES.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {tpl?.notes && <p className="text-xs text-vq-text-lo">{tpl.notes}</p>}
        <Input
          placeholder={t('Trunk name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder={
            tpl?.host ? t('SIP host (default {host})', { host: tpl.host }) : t('SIP host')
          }
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
        <Input
          placeholder={t('Auth username')}
          value={authUsername}
          onChange={(e) => setAuthUsername(e.target.value)}
        />
        <Input
          type="password"
          placeholder={t('Auth password / secret')}
          value={authPassword}
          onChange={(e) => setAuthPassword(e.target.value)}
        />
        {create.isError && (
          <p className="text-xs text-vq-danger">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!canSubmit} onClick={submit}>
            {create.isPending ? t('Connecting…') : t('Add trunk')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t('Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
