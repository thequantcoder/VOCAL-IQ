'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Info, Trash2, UserSquare2, Video } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, LoadingCard } from '../../../components/states';
import {
  type AvatarSession,
  useAvatars,
  useCreateAvatar,
  useDeleteAvatar,
  useEndAvatarSession,
  useStartAvatarSession,
} from '../../../lib/api';

/**
 * Digital-human / video avatars (Day 92). Curate a stock/custom avatar catalogue (custom needs likeness
 * consent) and start a session — video when the plan entitles it, else an automatic voice fallback.
 */
export default function AvatarsPage() {
  const avatars = useAvatars();
  const create = useCreateAvatar();
  const del = useDeleteAvatar();
  const start = useStartAvatarSession();
  const end = useEndAvatarSession();
  const [form, setForm] = useState({
    name: '',
    providerAvatarId: '',
    kind: 'stock',
    consent: false,
  });
  const [session, setSession] = useState<AvatarSession | null>(null);

  function add() {
    if (!form.name.trim() || !form.providerAvatarId.trim()) return;
    create.mutate(
      {
        name: form.name.trim(),
        providerAvatarId: form.providerAvatarId.trim(),
        kind: form.kind,
        likenessConsent: form.consent,
      },
      {
        onSuccess: () => setForm({ name: '', providerAvatarId: '', kind: 'stock', consent: false }),
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <UserSquare2 size={20} /> Video avatars
        </h1>
        <p className="text-sm text-vq-text-lo">
          A photoreal digital human that speaks your agent's responses on video — for reception,
          kiosks, and premium support. Video is plan-gated; sessions fall back to voice
          automatically.
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-vq border border-vq-border bg-vq-surface/40 p-3 text-vq-text-lo text-xs">
        <Info size={14} className="mt-0.5 shrink-0" /> Custom avatars use a real person's likeness
        and require explicit consent to add. Video minutes are billed by the second on eligible
        plans.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add an avatar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label htmlFor="av-name" className="flex flex-col gap-1 text-vq-text-lo text-xs">
              Name
              <Input
                id="av-name"
                placeholder="Ava (reception)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label htmlFor="av-pid" className="flex flex-col gap-1 text-vq-text-lo text-xs">
              Provider avatar id
              <Input
                id="av-pid"
                placeholder="provider's avatar/actor id"
                value={form.providerAvatarId}
                onChange={(e) => setForm({ ...form, providerAvatarId: e.target.value })}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label htmlFor="av-kind" className="flex items-center gap-2 text-vq-text-lo text-xs">
              Kind
              <select
                id="av-kind"
                className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="stock">Stock</option>
                <option value="custom">Custom (real likeness)</option>
              </select>
            </label>
            {form.kind === 'custom' && (
              <label className="flex items-center gap-2 text-sm text-vq-text-lo">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                />
                I have this person's consent to use their likeness
              </label>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={create.isPending || !form.name.trim() || !form.providerAvatarId.trim()}
              onClick={add}
            >
              {create.isPending ? 'Adding…' : 'Add avatar'}
            </Button>
            {create.isError && (
              <span className="text-vq-danger text-xs">{(create.error as Error).message}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="font-medium text-sm text-vq-text-hi">Catalogue</h2>
        {avatars.isLoading ? (
          <LoadingCard rows={2} />
        ) : !avatars.data || avatars.data.length === 0 ? (
          <EmptyState title="No avatars yet" hint="Add a stock or custom avatar above." />
        ) : (
          <ul className="flex flex-col gap-2">
            {avatars.data.map((a) => (
              <li key={a.id}>
                <Card className="flex flex-row items-center justify-between px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-vq-text-hi">{a.name}</span>
                    <span className="text-vq-text-lo text-xs">
                      {a.kind}
                      {a.likenessConsentAt ? ' · consent on file' : ''} · {a.provider}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={start.isPending}
                      onClick={() =>
                        start.mutate(
                          { avatarId: a.id, requestVideo: true },
                          { onSuccess: setSession },
                        )
                      }
                    >
                      <Video size={14} /> Start
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={del.isPending}
                      onClick={() => del.mutate(a.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {session && (
        <Card className={session.mode === 'video' ? 'border-vq-accent/50' : 'border-vq-warning/40'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Video size={16} /> Session · {session.mode}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {session.fallback ? (
              <p className="text-sm text-vq-warning">
                Fell back to voice ({session.fallbackReason?.replace('_', ' ')}). The caller is
                still served — enable a video-eligible plan to use the avatar.
              </p>
            ) : (
              <p className="text-sm text-vq-success">
                Video avatar streaming ({session.providerRef}).
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={end.isPending || session.status === 'ended'}
                onClick={() => end.mutate(session.id, { onSuccess: setSession })}
              >
                {session.status === 'ended' ? 'Ended' : 'End session'}
              </Button>
              {session.status === 'ended' && (
                <span className="text-vq-text-lo text-xs">
                  {session.seconds}s · ${session.costUsd.toFixed(2)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
