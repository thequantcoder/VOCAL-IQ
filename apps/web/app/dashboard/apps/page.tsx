'use client';

import { API_SCOPES, WEBHOOK_EVENTS, formatAmount } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Blocks } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type DeveloperApp,
  useAppBrowse,
  useInstallApp,
  useMyApps,
  useMyInstalls,
  useRegisterApp,
  useSubmitApp,
  useUninstallApp,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

const STATUS_COLOR: Record<string, string> = {
  draft: 'text-vq-text-lo border-vq-border',
  pending: 'text-vq-warn border-vq-warn/40',
  approved: 'text-vq-success border-vq-success/40',
  rejected: 'text-vq-danger border-vq-danger/40',
  suspended: 'text-vq-danger border-vq-danger/40',
};

/**
 * Developer app / integration marketplace (Day 84). Browse + install third-party apps (each install
 * mints a scoped API key limited to the scopes you consent to), or publish your own app for developers
 * to build on. Approved apps are public; your drafts + installs stay private.
 */
export default function AppsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Blocks size={20} /> {t('Apps & integrations')}
        </h1>
        <p className="text-sm text-vq-text-lo">
          {t(
            'Install third-party apps (each gets only the scopes you approve) or publish your own for revenue share.',
          )}
        </p>
      </div>

      <BrowseApps />
      <MyInstalls />
      <RegisterApp />
      <MyApps />
    </div>
  );
}

function BrowseApps() {
  const { t } = useI18n();
  const browse = useAppBrowse();
  const [consenting, setConsenting] = useState<DeveloperApp | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Browse apps')}</CardTitle>
      </CardHeader>
      <CardContent>
        {browse.isLoading ? (
          <LoadingCard rows={3} />
        ) : browse.isError ? (
          <ErrorState message={(browse.error as Error).message} onRetry={() => browse.refetch()} />
        ) : !browse.data || browse.data.length === 0 ? (
          <EmptyState title={t('No apps yet')} hint={t('Be the first to publish one.')} />
        ) : (
          <div className="flex flex-col gap-2">
            {browse.data.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-vq-text-hi">{a.name}</span>
                  <span className="truncate text-vq-text-lo text-xs">
                    {a.priceCents === 0 ? t('Free') : formatAmount(a.priceCents, 'USD')} ·{' '}
                    {t('{s} scopes · {i} installs', {
                      s: a.requestedScopes.length,
                      i: a.installCount,
                    })}
                  </span>
                </div>
                <Button size="sm" onClick={() => setConsenting(a)}>
                  {t('Install')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {consenting && <ConsentDialog app={consenting} onClose={() => setConsenting(null)} />}
    </Card>
  );
}

/** The scope-consent screen — the tenant explicitly approves which scopes the app receives. */
function ConsentDialog({ app, onClose }: { app: DeveloperApp; onClose: () => void }) {
  const { t } = useI18n();
  const install = useInstallApp();
  const [granted, setGranted] = useState<string[]>(app.requestedScopes);
  const [minted, setMinted] = useState<string | null>(null);

  function toggle(scope: string) {
    setGranted((g) => (g.includes(scope) ? g.filter((s) => s !== scope) : [...g, scope]));
  }

  async function confirm() {
    const res = await install.mutateAsync({ id: app.id, grantScopes: granted });
    if (res.apiKey) setMinted(res.apiKey.key);
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">{t('Install “{name}”', { name: app.name })}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {minted ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-vq-text-hi">
                {t('Installed. Give this key to the app — shown once:')}
              </p>
              <code className="break-all rounded-vq border border-vq-border bg-vq-surface-2 p-2 text-vq-success text-xs">
                {minted}
              </code>
              <Button size="sm" className="self-end" onClick={onClose}>
                {t('Done')}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-vq-text-lo">
                {t(
                  'This app is requesting the scopes below. Uncheck any you don’t want to grant — a scoped key is minted for exactly what you approve.',
                )}
              </p>
              <div className="flex flex-col gap-1">
                {app.requestedScopes.map((scope) => (
                  <label
                    key={scope}
                    htmlFor={`scope-${scope}`}
                    className="flex items-center gap-2 text-sm text-vq-text-hi"
                  >
                    <input
                      id={`scope-${scope}`}
                      type="checkbox"
                      checked={granted.includes(scope)}
                      onChange={() => toggle(scope)}
                    />
                    {scope}
                  </label>
                ))}
              </div>
              {app.priceCents > 0 && (
                <p className="text-vq-text-lo text-xs">
                  {t('One-time fee: {fee} (charged to your wallet).', {
                    fee: formatAmount(app.priceCents, 'USD'),
                  })}
                </p>
              )}
              {install.isError && (
                <p className="text-vq-danger text-xs">{(install.error as Error).message}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onClose}>
                  {t('Cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={granted.length === 0 || install.isPending}
                  onClick={confirm}
                >
                  {install.isPending ? t('Installing…') : t('Approve & install')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MyInstalls() {
  const { t } = useI18n();
  const installs = useMyInstalls();
  const uninstall = useUninstallApp();
  const active = (installs.data ?? []).filter((i) => i.status === 'active');
  if (active.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Installed apps')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {active.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-vq-text-hi">{i.app?.name ?? t('App')}</span>
              <span className="truncate text-vq-text-lo text-xs">
                {i.grantedScopes.join(', ') || t('no scopes')}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={uninstall.isPending}
              onClick={() => uninstall.mutate(i.appId)}
            >
              {t('Uninstall')}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RegisterApp() {
  const { t } = useI18n();
  const register = useRegisterApp();
  const submit = useSubmitApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [price, setPrice] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);

  function toggle<T>(list: T[], set: (v: T[]) => void, v: T) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  async function create() {
    if (name.length < 3 || scopes.length === 0) return;
    const res = await register.mutateAsync({
      name,
      description,
      ...(webhookUrl ? { webhookUrl } : {}),
      requestedScopes: scopes,
      events,
      priceCents: Math.round(Number(price || '0') * 100),
    });
    setSecret(res.clientSecret);
    // Immediately submit the fresh draft for platform review.
    await submit.mutateAsync({ id: res.app.id, status: 'pending' }).catch(() => {});
    setName('');
    setDescription('');
    setWebhookUrl('');
    setPrice('');
    setScopes([]);
    setEvents([]);
  }

  if (!open) {
    return (
      <Button size="sm" className="self-start" onClick={() => setOpen(true)}>
        {t('Publish an app')}
      </Button>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Publish an app')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {secret ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-vq-text-hi">
              {t('App registered + submitted for review. Your client secret (shown once):')}
            </p>
            <code className="break-all rounded-vq border border-vq-border bg-vq-surface-2 p-2 text-vq-success text-xs">
              {secret}
            </code>
            <Button
              size="sm"
              className="self-end"
              onClick={() => {
                setSecret(null);
                setOpen(false);
              }}
            >
              {t('Done')}
            </Button>
          </div>
        ) : (
          <>
            <Input
              placeholder={t('App name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder={t('Description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Input
              placeholder={t('Webhook URL (https://…, optional)')}
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <span className="text-vq-text-lo text-xs">{t('Requested scopes')}</span>
              {API_SCOPES.map((scope) => (
                <label
                  key={scope}
                  htmlFor={`req-${scope}`}
                  className="flex items-center gap-2 text-sm text-vq-text-hi"
                >
                  <input
                    id={`req-${scope}`}
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggle(scopes, setScopes, scope)}
                  />
                  {scope}
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-vq-text-lo text-xs">{t('Subscribed events')}</span>
              {WEBHOOK_EVENTS.map((ev) => (
                <label
                  key={ev}
                  htmlFor={`ev-${ev}`}
                  className="flex items-center gap-2 text-sm text-vq-text-hi"
                >
                  <input
                    id={`ev-${ev}`}
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={() => toggle(events, setEvents, ev)}
                  />
                  {ev}
                </label>
              ))}
            </div>
            <label htmlFor="app-price" className="flex flex-col gap-1 text-vq-text-lo text-xs">
              {t('Install fee ($) — you keep 70%')}
              <Input
                id="app-price"
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            {register.isError && (
              <p className="text-vq-danger text-xs">{(register.error as Error).message}</p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={name.length < 3 || scopes.length === 0 || register.isPending}
                onClick={create}
              >
                {register.isPending ? t('Publishing…') : t('Publish & submit')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {t('Cancel')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MyApps() {
  const { t } = useI18n();
  const mine = useMyApps();
  const submit = useSubmitApp();
  if (!mine.data || mine.data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('My apps')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {mine.data.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 text-vq-text-hi">
                {a.name}
                <span
                  className={`rounded-vq-pill border px-2 py-0.5 text-xs ${STATUS_COLOR[a.status] ?? ''}`}
                >
                  {a.status}
                </span>
              </span>
              <span className="truncate text-vq-text-lo text-xs">
                {t('{id} · {n} installs', { id: a.clientId, n: a.installCount })}
              </span>
            </span>
            {a.status === 'draft' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={submit.isPending}
                onClick={() => submit.mutate({ id: a.id, status: 'pending' })}
              >
                {t('Submit for review')}
              </Button>
            )}
            {a.status === 'rejected' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={submit.isPending}
                onClick={() => submit.mutate({ id: a.id, status: 'draft' })}
              >
                {t('Revise')}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
