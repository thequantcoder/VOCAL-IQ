'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { BadgeCheck, CheckCircle2, Lock, Mic, Sliders } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type VoiceDto,
  useApproveVoice,
  useCloneVoice,
  useUpdateVoiceSettings,
  useVoices,
} from '../../../lib/api';

const GENDERS = ['', 'male', 'female', 'neutral'] as const;

/** Voice library (Day 26): browse presets + private/cloned voices, tune, clone (gated). */
export default function VoicesPage() {
  const [gender, setGender] = useState('');
  const voices = useVoices(gender ? { gender } : {});

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-xl text-vq-text-hi">
          <Mic size={20} /> Voice library
        </h1>
        <p className="text-sm text-vq-text-lo">
          Preview presets, tune delivery, and clone a consented voice. Cloned voices stay locked
          until an operator approves them.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {GENDERS.map((g) => (
          <button
            key={g || 'all'}
            type="button"
            onClick={() => setGender(g)}
            className={`rounded-vq-pill border px-3 py-1 text-sm capitalize ${
              gender === g
                ? 'border-vq-violet bg-vq-violet/10 text-vq-text-hi'
                : 'border-vq-border text-vq-text-lo hover:text-vq-text-hi'
            }`}
          >
            {g || 'all'}
          </button>
        ))}
      </div>

      <CloneCard />

      {voices.isLoading ? (
        <LoadingCard rows={3} />
      ) : voices.isError ? (
        <ErrorState message={(voices.error as Error).message} onRetry={() => voices.refetch()} />
      ) : !voices.data || voices.data.length === 0 ? (
        <EmptyState title="No voices match this filter" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {voices.data.map((v) => (
            <VoiceCard key={v.id} voice={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceCard({ voice }: { voice: VoiceDto }) {
  const update = useUpdateVoiceSettings();
  const approve = useApproveVoice();
  const [stability, setStability] = useState(voice.settings.stability);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{voice.name}</CardTitle>
          {voice.isPreset ? (
            <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-[11px] text-vq-text-lo uppercase">
              preset
            </span>
          ) : voice.usable ? (
            <span className="flex items-center gap-1 text-[11px] text-vq-success uppercase">
              <BadgeCheck size={13} /> ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-vq-warn uppercase">
              <Lock size={13} /> pending
            </span>
          )}
        </div>
        <p className="text-xs text-vq-text-lo">
          {[voice.gender, voice.age, voice.accent, voice.style].filter(Boolean).join(' · ')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!voice.isPreset && (
          <label className="flex flex-col gap-1 text-xs text-vq-text-lo">
            <span className="flex items-center gap-1">
              <Sliders size={13} /> Stability {stability.toFixed(2)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={stability}
              onChange={(e) => setStability(Number(e.target.value))}
              onMouseUp={() => update.mutate({ id: voice.id, settings: { stability } })}
            />
          </label>
        )}
        {!voice.usable && !voice.isPreset && (
          <Button
            size="sm"
            variant="secondary"
            disabled={approve.isPending}
            onClick={() => approve.mutate(voice.id)}
          >
            <CheckCircle2 size={15} /> Approve clone
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Cloning form — captures mandatory consent before creating a private (locked) voice. */
function CloneCard() {
  const clone = useCloneVoice();
  const [name, setName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [sampleUrl, setSampleUrl] = useState('');
  const [consent, setConsent] = useState(false);

  const canSubmit = name && subjectName && sampleUrl && consent && !clone.isPending;

  async function submit() {
    if (!consent) return;
    await clone.mutateAsync({
      name,
      sampleUrls: [sampleUrl],
      consent: {
        consentGiven: true,
        subjectName,
        statement: `${subjectName} consented to voice cloning on ${new Date().toISOString()}.`,
      },
    });
    setName('');
    setSubjectName('');
    setSampleUrl('');
    setConsent(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Clone a voice</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Voice name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="Consenting person's name"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
        />
        <Input
          placeholder="Sample audio URL (consented)"
          value={sampleUrl}
          onChange={(e) => setSampleUrl(e.target.value)}
        />
        <label className="flex items-start gap-2 text-xs text-vq-text-lo">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I confirm the person named above has given explicit consent for their voice to be cloned
            and used by this agent.
          </span>
        </label>
        {clone.isError && (
          <p className="text-xs text-vq-danger">{(clone.error as Error).message}</p>
        )}
        <Button size="sm" disabled={!canSubmit} onClick={submit}>
          {clone.isPending ? 'Cloning…' : 'Create locked clone'}
        </Button>
      </CardContent>
    </Card>
  );
}
