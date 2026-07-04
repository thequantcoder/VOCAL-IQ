'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { KeyRound, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../../components/states';
import {
  type VaultKey,
  useAddVaultKey,
  useRevokeVaultKey,
  useRotateVaultKey,
  useVaultKeys,
} from '../../../../lib/api';

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

const PROVIDERS = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'DEEPGRAM', 'ELEVENLABS', 'TWILIO', 'LIVEKIT'];

/**
 * Provider key vault (Day 57): add/rotate/revoke provider secrets, envelope-encrypted at rest and
 * never displayed after entry. Platform keys are super-admin-only; a tenant manages its own BYOK
 * keys. Scope tabs switch between them.
 */
export default function VaultPage() {
  const [scope, setScope] = useState<'platform' | 'tenant'>('tenant');
  const keys = useVaultKeys(scope);
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Shield size={20} /> Key vault
          </h1>
          <p className="text-sm text-vq-text-lo">
            Provider secrets, envelope-encrypted at rest. Never shown again after entry.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> Add key
        </Button>
      </div>

      <div className="flex gap-2">
        {(['tenant', 'platform'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`rounded-vq-pill border px-3 py-1 text-sm ${
              scope === s ? 'border-vq-brand/50 text-vq-brand' : 'border-vq-border text-vq-text-lo'
            }`}
          >
            {s === 'tenant' ? 'My keys (BYOK)' : 'Platform keys'}
          </button>
        ))}
      </div>

      {adding && <AddKey scope={scope} onDone={() => setAdding(false)} />}

      {keys.isLoading ? (
        <LoadingCard rows={3} />
      ) : keys.isError ? (
        <ErrorState message={(keys.error as Error).message} onRetry={() => keys.refetch()} />
      ) : !keys.data || keys.data.length === 0 ? (
        <EmptyState title="No keys yet" hint="Add a provider key — it will be encrypted at rest." />
      ) : (
        <div className="flex flex-col gap-3">
          {keys.data.map((k) => (
            <KeyRow key={k.id} vaultKey={k} />
          ))}
        </div>
      )}
    </div>
  );
}

function KeyRow({ vaultKey }: { vaultKey: VaultKey }) {
  const rotate = useRotateVaultKey();
  const revoke = useRevokeVaultKey();
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState('');

  async function doRotate() {
    if (newKey.trim().length < 8) return;
    await rotate.mutateAsync({ id: vaultKey.id, apiKey: newKey.trim() });
    setNewKey('');
    setRotating(false);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-vq-text-lo" />
            <span className="font-medium text-vq-text-hi">{vaultKey.provider}</span>
            <span className="font-mono text-vq-text-lo text-xs">{vaultKey.last4}</span>
            <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
              {vaultKey.scope === 'platform' ? 'platform' : 'BYOK'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRotating((v) => !v)}>
              <RefreshCw size={14} /> Rotate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(vaultKey.id)}
            >
              <Trash2 size={14} /> Revoke
            </Button>
          </div>
        </div>
        {rotating && (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              placeholder="New key value"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <Button
              size="sm"
              disabled={rotate.isPending || newKey.trim().length < 8}
              onClick={doRotate}
            >
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddKey({ scope, onDone }: { scope: 'platform' | 'tenant'; onDone: () => void }) {
  const add = useAddVaultKey();
  const [provider, setProvider] = useState(PROVIDERS[0] as string);
  const [apiKey, setApiKey] = useState('');
  const valid = apiKey.trim().length >= 8;

  async function submit() {
    if (!valid) return;
    await add.mutateAsync({ provider, apiKey: apiKey.trim(), scope });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Add {scope === 'platform' ? 'platform' : 'BYOK'} key
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className={inputCls}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <Input
          type="password"
          placeholder="API key (stored encrypted, never shown again)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        {add.isError && <p className="text-vq-danger text-xs">{(add.error as Error).message}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={!valid || add.isPending} onClick={submit}>
            {add.isPending ? 'Encrypting…' : 'Add key'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
