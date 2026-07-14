'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Copy, KeyRound, Plus, Terminal, Trash2, Webhook } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  API_SCOPES,
  type ApiKey,
  type ApiScope,
  type Webhook as WebhookRow,
  useApiKeys,
  useCreateApiKey,
  useCreateWebhook,
  useDeleteWebhook,
  useRevokeApiKey,
  useWebhookEvents,
  useWebhooks,
} from '../../../lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Developer platform (Day 48): API keys, webhooks, and the OpenAPI spec + SDK. */
export default function DevelopersPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <KeyRound size={20} /> Developers
        </h1>
        <p className="text-sm text-vq-text-lo">
          Embed VocalIQ: API keys, webhooks, the{' '}
          <a
            href={`${API_URL}/v1/openapi.json`}
            target="_blank"
            rel="noreferrer"
            className="text-vq-violet underline"
          >
            OpenAPI spec
          </a>
          , and the <code>@vocaliq/sdk</code> TypeScript client.
        </p>
      </div>

      <Link
        href="/dashboard/developers/api"
        className="flex items-center justify-between rounded-vq border border-vq-border px-4 py-3 transition-colors hover:border-vq-brand/50"
      >
        <span className="flex items-center gap-2 text-sm text-vq-text-hi">
          <Terminal size={16} className="text-vq-brand" /> Interactive API reference
        </span>
        <span className="text-vq-text-lo text-xs">
          copy-ready curl + live “Try it” for every endpoint →
        </span>
      </Link>

      <ApiKeysSection />
      <WebhooksSection />
    </div>
  );
}

function ApiKeysSection() {
  const keys = useApiKeys();
  const [creating, setCreating] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm text-vq-text-hi">API keys</h2>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={14} /> New key
        </Button>
      </div>
      {creating && <CreateKey onDone={() => setCreating(false)} />}
      {keys.isLoading ? (
        <LoadingCard rows={2} />
      ) : keys.isError ? (
        <ErrorState message={(keys.error as Error).message} onRetry={() => keys.refetch()} />
      ) : !keys.data || keys.data.length === 0 ? (
        <EmptyState title="No API keys" hint="Create a scoped key to call the public API." />
      ) : (
        keys.data.map((k) => <KeyRow key={k.id} apiKey={k} />)
      )}
    </section>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const revoke = useRevokeApiKey();
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${apiKey.revoked ? 'text-vq-text-lo line-through' : 'text-vq-text-hi'}`}
            >
              {apiKey.name}
            </span>
            <code className="text-vq-text-lo text-xs">{apiKey.prefix}…</code>
          </div>
          <span className="text-vq-text-lo text-xs">
            {apiKey.scopes.join(', ')} · {apiKey.rateLimitPerMin}/min · {apiKey.requestCount} calls
          </span>
        </div>
        {!apiKey.revoked && (
          <Button
            size="sm"
            variant="ghost"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(apiKey.id)}
          >
            Revoke
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CreateKey({ onDone }: { onDone: () => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiScope[]>(['agents:read']);

  function toggle(s: ApiScope) {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }
  async function submit() {
    if (!name.trim() || scopes.length === 0) return;
    await create.mutateAsync({ name: name.trim(), scopes });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New API key</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {create.data ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-vq-success">Copy your key now — it won't be shown again.</p>
            <div className="flex items-center gap-2 rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2">
              <code className="flex-1 truncate font-mono text-sm text-vq-text-hi">
                {create.data.key}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const created = create.data;
                  if (created) navigator.clipboard?.writeText(created.key);
                }}
              >
                <Copy size={14} />
              </Button>
            </div>
            <Button size="sm" onClick={onDone}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <Input
              placeholder="Key name (e.g. Zapier)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {API_SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  className={`rounded-vq-pill border px-2 py-0.5 text-xs ${
                    scopes.includes(s)
                      ? 'border-vq-violet bg-vq-violet/10 text-vq-text-hi'
                      : 'border-vq-border text-vq-text-lo'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {create.isError && (
              <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!name.trim() || scopes.length === 0 || create.isPending}
                onClick={submit}
              >
                {create.isPending ? 'Creating…' : 'Create key'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WebhooksSection() {
  const webhooks = useWebhooks();
  const events = useWebhookEvents();
  const create = useCreateWebhook();
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(e: string) {
    setSelected((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }
  async function submit() {
    if (!/^https?:\/\//.test(url) || selected.length === 0) return;
    await create.mutateAsync({ url: url.trim(), events: selected });
    setUrl('');
    setSelected([]);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-medium text-sm text-vq-text-hi">
        <Webhook size={15} /> Webhooks
      </h2>
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <Input
            placeholder="https://your-app.com/webhooks/vocaliq"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {(events.data ?? []).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggle(e)}
                className={`rounded-vq-pill border px-2 py-0.5 text-xs ${
                  selected.includes(e)
                    ? 'border-vq-cyan bg-vq-cyan/10 text-vq-text-hi'
                    : 'border-vq-border text-vq-text-lo'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          {create.data && (
            <p className="break-all text-vq-success text-xs">
              Signing secret (shown once): <code>{create.data.secret}</code>
            </p>
          )}
          {create.isError && (
            <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
          )}
          <div>
            <Button
              size="sm"
              disabled={!/^https?:\/\//.test(url) || selected.length === 0 || create.isPending}
              onClick={submit}
            >
              <Plus size={14} /> Add webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      {webhooks.data && webhooks.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {webhooks.data.map((w) => (
            <WebhookRowItem key={w.id} webhook={w} />
          ))}
        </div>
      )}
    </section>
  );
}

function WebhookRowItem({ webhook }: { webhook: WebhookRow }) {
  const del = useDeleteWebhook();
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm text-vq-text-hi">{webhook.url}</span>
          <span className="text-vq-text-lo text-xs">{webhook.events.join(', ')}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={del.isPending}
          onClick={() => del.mutate(webhook.id)}
        >
          <Trash2 size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}
