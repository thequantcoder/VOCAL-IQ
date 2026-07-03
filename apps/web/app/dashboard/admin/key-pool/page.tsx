'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import {
  type KeyPoolDto,
  useAddPoolKey,
  useDeletePoolKey,
  useKeyPool,
  useSetPoolKeyActive,
} from '../../../../lib/api';

const PROVIDERS = ['OPENAI', 'ANTHROPIC', 'DEEPGRAM', 'ELEVENLABS'];

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/**
 * Platform API key pool (Day 38, SUPER_ADMIN). Add multiple managed keys per provider to
 * balance load + dodge rate limits; failing keys are auto-ejected and re-probed. Keys are
 * write-only — added here, never shown again.
 */
export default function KeyPoolPage() {
  const pool = useKeyPool();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <KeyRound size={20} /> Platform key pool
          </h1>
          <p className="text-sm text-vq-text-lo">
            Load-balanced managed keys. Traffic is spread by weight; a key that keeps failing is
            ejected automatically, then re-probed.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> Add key
        </Button>
      </div>

      {adding && <AddKey onDone={() => setAdding(false)} />}

      {pool.isLoading ? (
        <LoadingCard rows={3} />
      ) : pool.isError ? (
        <ErrorState message={(pool.error as Error).message} onRetry={() => pool.refetch()} />
      ) : !pool.data || pool.data.length === 0 ? (
        <EmptyState title="No pooled keys" hint="Managed calls fall back to the env key." />
      ) : (
        <div className="flex flex-col gap-2">
          {pool.data.map((k) => (
            <KeyRow key={k.id} k={k} />
          ))}
        </div>
      )}
    </div>
  );
}

function KeyRow({ k }: { k: KeyPoolDto }) {
  const setActive = useSetPoolKeyActive();
  const del = useDeletePoolKey();
  const state = !k.active ? 'off' : k.ejected ? 'ejected' : 'healthy';
  const stateStyle = {
    healthy: 'border-vq-success/40 bg-vq-success/10 text-vq-success',
    ejected: 'border-vq-danger/40 bg-vq-danger/10 text-vq-danger',
    off: 'border-vq-border text-vq-text-lo',
  }[state];

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div className="flex flex-col gap-0.5">
          <p className="font-medium text-vq-text-hi">
            {k.provider}{' '}
            <span className="font-mono text-vq-text-lo text-xs">{k.label ?? '••••'}</span>
          </p>
          <p className="text-vq-text-lo text-xs">
            weight {k.weight} · {k.failureCount} recent failures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-vq-pill border px-2 py-0.5 text-[11px]', stateStyle)}>
            {state}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActive.mutate({ id: k.id, active: !k.active })}
          >
            {k.active ? 'Disable' : 'Enable'}
          </Button>
          <button
            type="button"
            aria-label="Remove key"
            onClick={() => del.mutate(k.id)}
            className="rounded-vq p-1.5 text-vq-text-lo hover:text-vq-danger"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddKey({ onDone }: { onDone: () => void }) {
  const add = useAddPoolKey();
  const [provider, setProvider] = useState('OPENAI');
  const [apiKey, setApiKey] = useState('');
  const [weight, setWeight] = useState(1);

  async function submit() {
    await add.mutateAsync({ provider, apiKey, weight });
    setApiKey('');
    onDone();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="font-medium text-sm text-vq-text-hi">Add a platform key</p>
        <div className="flex gap-3">
          <label htmlFor="kp-provider" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Provider
            <select
              id="kp-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className={cn(inputCls, 'w-40')}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="kp-weight" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Weight
            <input
              id="kp-weight"
              type="number"
              min={1}
              max={100}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className={cn(inputCls, 'w-24')}
            />
          </label>
        </div>
        <label htmlFor="kp-key" className="flex flex-col gap-1 text-vq-text-lo text-xs">
          API key (stored sealed, never shown again)
          <Input
            id="kp-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
          />
        </label>
        {add.isError && <p className="text-vq-danger text-xs">{(add.error as Error).message}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={apiKey.length < 8 || add.isPending} onClick={submit}>
            {add.isPending ? 'Adding…' : 'Add key'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
