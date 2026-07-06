'use client';

import {
  DEFAULT_EMOTION_POLICY,
  type EmotionPolicy,
  type EmotionTone,
  type Expressiveness,
  type SentimentSignal,
  classifyTone,
  resolveExpressiveSettings,
} from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Smile } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { useAgents, useEmotionPolicy, useSaveEmotionPolicy } from '../../../lib/api';

const EXPRESSIVENESS: Expressiveness[] = ['subtle', 'balanced', 'expressive'];
const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi';

const TONE_COPY: Record<EmotionTone, { label: string; color: string }> = {
  neutral: { label: 'Neutral', color: 'text-vq-text-lo border-vq-border' },
  empathetic: { label: 'Empathetic', color: 'text-vq-accent border-vq-accent/40' },
  reassuring: { label: 'Reassuring', color: 'text-vq-success border-vq-success/40' },
  upbeat: { label: 'Upbeat', color: 'text-vq-warn border-vq-warn/40' },
};

/** Representative caller moods used to preview how the voice will adapt (no live call needed). */
const SAMPLE_MOODS: { name: string; signal: SentimentSignal }[] = [
  {
    name: 'Angry caller',
    signal: { sentimentScore: -0.6, anger: 0.8, frustration: 0.6, buyingIntent: 0 },
  },
  {
    name: 'Upset / sad',
    signal: { sentimentScore: -0.6, anger: 0.1, frustration: 0.1, buyingIntent: 0 },
  },
  {
    name: 'Happy / good news',
    signal: { sentimentScore: 0.7, anger: 0, frustration: 0, buyingIntent: 0.3 },
  },
  { name: 'Neutral', signal: { sentimentScore: 0.05, anger: 0, frustration: 0, buyingIntent: 0 } },
];

/**
 * Emotion-aware voice modulation (Day 77): make an agent's voice adapt its tone to the caller's mood
 * — empathetic when they're upset, calm to de-escalate anger, brighter for good news — within a
 * policy you control. The preview shows exactly how each mood maps to the voice, so you can tune it
 * before going live. Guardrails guarantee an upset caller is never sped up or given a "cheerful" voice.
 */
export default function VoiceEmotionPage() {
  const agents = useAgents();
  const [agentId, setAgentId] = useState('');

  // Default to the first agent once loaded.
  useEffect(() => {
    const first = agents.data?.[0];
    if (!agentId && first) setAgentId(first.id);
  }, [agents.data, agentId]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Smile size={20} /> Voice emotion
        </h1>
        <p className="text-sm text-vq-text-lo">
          Let an agent's voice respond to how the caller feels — empathetic when they're upset, calm
          to de-escalate, brighter for good news — all within a policy you control.
        </p>
      </div>

      {agents.isLoading ? (
        <LoadingCard rows={2} />
      ) : agents.isError ? (
        <ErrorState message={(agents.error as Error).message} onRetry={() => agents.refetch()} />
      ) : !agents.data || agents.data.length === 0 ? (
        <EmptyState
          title="No agents yet"
          hint="Create an agent first, then tune its voice emotion."
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor="agent" className="text-sm text-vq-text-lo">
              Agent
            </label>
            <select
              id="agent"
              className={SELECT_CLS}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              {agents.data.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {agentId && <PolicyEditor key={agentId} agentId={agentId} />}
        </>
      )}
    </div>
  );
}

function PolicyEditor({ agentId }: { agentId: string }) {
  const query = useEmotionPolicy(agentId);
  const save = useSaveEmotionPolicy(agentId);
  const [policy, setPolicy] = useState<EmotionPolicy | null>(null);

  useEffect(() => {
    if (query.data) setPolicy(query.data);
  }, [query.data]);

  if (query.isLoading || !policy) return <LoadingCard rows={3} />;
  if (query.isError)
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;

  const set = <K extends keyof EmotionPolicy>(key: K, value: EmotionPolicy[K]) =>
    setPolicy((p) => (p ? { ...p, [key]: value } : p));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm text-vq-text-hi">
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={(e) => set('enabled', e.target.checked)}
            />
            Enable emotion-aware voice for this agent
          </label>

          <div className="flex items-center gap-3">
            <span className="w-40 text-sm text-vq-text-lo">Expressiveness</span>
            <select
              aria-label="Expressiveness"
              className={SELECT_CLS}
              value={policy.expressiveness}
              disabled={!policy.enabled}
              onChange={(e) => set('expressiveness', e.target.value as Expressiveness)}
            >
              {EXPRESSIVENESS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <Slider
            label="Max expressiveness (style cap)"
            value={policy.maxStyle}
            min={0}
            max={1}
            step={0.05}
            disabled={!policy.enabled}
            onChange={(v) => set('maxStyle', v)}
          />
          <Slider
            label="Anger sensitivity"
            hint="Lower ⇒ de-escalate sooner"
            value={policy.angerThreshold}
            min={0}
            max={1}
            step={0.05}
            disabled={!policy.enabled}
            onChange={(v) => set('angerThreshold', v)}
          />
          <Slider
            label="Negative sensitivity"
            hint="Higher (toward 0) ⇒ empathetic sooner"
            value={policy.negativeThreshold}
            min={-1}
            max={0}
            step={0.05}
            disabled={!policy.enabled}
            onChange={(v) => set('negativeThreshold', v)}
          />
          <Slider
            label="Positive sensitivity"
            hint="Lower ⇒ upbeat sooner"
            value={policy.positiveThreshold}
            min={0}
            max={1}
            step={0.05}
            disabled={!policy.enabled}
            onChange={(v) => set('positiveThreshold', v)}
          />

          {save.isError && (
            <p className="text-vq-danger text-xs">{(save.error as Error).message}</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="self-start"
              disabled={save.isPending}
              onClick={() => save.mutate(policy)}
            >
              {save.isPending ? 'Saving…' : 'Save policy'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setPolicy({ ...DEFAULT_EMOTION_POLICY })}
            >
              Reset to default
            </Button>
            {save.isSuccess && !save.isPending && (
              <span className="text-vq-success text-xs">Saved</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Preview policy={policy} />
    </>
  );
}

/** Live, client-side preview using the SAME pure mapping the voice loop runs. */
function Preview({ policy }: { policy: EmotionPolicy }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How the voice adapts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!policy.enabled && (
          <p className="text-vq-text-lo text-xs">
            Disabled — the agent uses a neutral voice for every caller.
          </p>
        )}
        {SAMPLE_MOODS.map((m) => {
          const tone = classifyTone(m.signal, policy);
          const s = resolveExpressiveSettings(tone, policy);
          const copy = TONE_COPY[tone];
          return (
            <div key={m.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="w-32 shrink-0 text-vq-text-lo">{m.name}</span>
              <span className={`rounded-vq-pill border px-2 py-0.5 text-xs ${copy.color}`}>
                {copy.label}
              </span>
              <div className="flex flex-1 flex-wrap justify-end gap-x-4 gap-y-1 text-vq-text-lo text-xs">
                <Metric label="warmth" value={s.stability} />
                <Metric label="energy" value={s.style} />
                <Metric label="pace" value={s.speed} unit="×" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <span>
      {label}{' '}
      <span className="text-vq-text-hi">
        {value.toFixed(2)}
        {unit ?? ''}
      </span>
    </span>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-sm text-vq-text-lo">
        {label}
        {hint && <span className="block text-[10px] text-vq-text-lo/70">{hint}</span>}
      </span>
      <input
        type="range"
        aria-label={label}
        className="flex-1 accent-vq-accent"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-10 text-right text-vq-text-hi text-xs">{value.toFixed(2)}</span>
    </div>
  );
}
