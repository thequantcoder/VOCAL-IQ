'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@vocaliq/ui';
import { ArrowLeft, Ban, Gauge, ShieldAlert, Timer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingCard } from '../../../../../components/states';
import { type AgentDetail, useAgent, useUpdateAgent } from '../../../../../lib/api';

const BANNED_ACTIONS = [
  { value: 'flag', label: 'Flag', hint: 'Speak, but log it for QA' },
  { value: 'redact', label: 'Redact', hint: 'Mask the term in speech' },
  { value: 'block', label: 'Block', hint: 'Suppress the whole turn' },
] as const;

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/**
 * Agent cost/reliability guards (Day 38): turn-timeout, auto-hangup limits (max duration +
 * dead-air), and banned-word enforcement. These protect margin against runaway calls and
 * keep the agent on-message.
 */
export default function AgentSettingsPage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id ?? '';
  const agent = useAgent(agentId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href={`/dashboard/agents/${agentId}/builder`}
        className="flex w-fit items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> Builder
      </Link>
      <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
        <Gauge size={20} /> Cost &amp; reliability
      </h1>

      {agent.isLoading || !agent.data ? (
        <LoadingCard rows={4} />
      ) : (
        <GuardsForm agentId={agentId} agent={agent.data} />
      )}
    </div>
  );
}

function GuardsForm({ agentId, agent }: { agentId: string; agent: AgentDetail }) {
  const update = useUpdateAgent(agentId);
  const [turnTimeoutMs, setTurnTimeoutMs] = useState(agent.turnTimeoutMs);
  const [maxCallDurationSec, setMaxDur] = useState(agent.maxCallDurationSec);
  const [maxSilenceSec, setMaxSilence] = useState(agent.maxSilenceSec);
  const [endOnVoicemail, setEndOnVoicemail] = useState(agent.endOnVoicemail);
  const [bannedWordsAction, setAction] = useState(agent.bannedWordsAction);
  const [bannedWords, setBannedWords] = useState((agent.persona?.bannedWords ?? []).join(', '));
  const [saved, setSaved] = useState(false);

  // Reflect a re-fetch (e.g. after navigating back) into local state.
  useEffect(() => {
    setTurnTimeoutMs(agent.turnTimeoutMs);
    setMaxDur(agent.maxCallDurationSec);
    setMaxSilence(agent.maxSilenceSec);
    setEndOnVoicemail(agent.endOnVoicemail);
    setAction(agent.bannedWordsAction);
    setBannedWords((agent.persona?.bannedWords ?? []).join(', '));
  }, [agent]);

  async function save() {
    setSaved(false);
    await update.mutateAsync({
      turnTimeoutMs,
      maxCallDurationSec,
      maxSilenceSec,
      endOnVoicemail,
      bannedWordsAction,
      bannedWords: bannedWords
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
    });
    setSaved(true);
  }

  return (
    <>
      {/* Turn timeout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer size={16} /> Turn timeout
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-vq-text-lo">
            How long to wait for the caller to keep speaking before the agent responds.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={turnTimeoutMs}
              onChange={(e) => setTurnTimeoutMs(Number(e.target.value))}
              className="flex-1 accent-vq-violet"
              aria-label="Turn timeout in milliseconds"
            />
            <span className="w-16 text-right font-mono text-sm text-vq-text-hi">
              {(turnTimeoutMs / 1000).toFixed(1)}s
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Auto hang-up */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert size={16} /> Auto hang-up
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-vq-text-lo">
            End runaway calls so they can't burn credits. A hard duration cap and a dead-air cutoff,
            applied by the live call loop.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label htmlFor="max-dur" className="flex flex-col gap-1 text-vq-text-lo text-xs">
              Max call duration (seconds)
              <input
                id="max-dur"
                type="number"
                min={30}
                max={7200}
                value={maxCallDurationSec}
                onChange={(e) => setMaxDur(Number(e.target.value))}
                className={inputCls}
              />
            </label>
            <label htmlFor="max-silence" className="flex flex-col gap-1 text-vq-text-lo text-xs">
              Dead-air cutoff (seconds, 0 = off)
              <input
                id="max-silence"
                type="number"
                min={0}
                max={120}
                value={maxSilenceSec}
                onChange={(e) => setMaxSilence(Number(e.target.value))}
                className={inputCls}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-vq-text-lo">
            <input
              type="checkbox"
              checked={endOnVoicemail}
              onChange={(e) => setEndOnVoicemail(e.target.checked)}
            />
            End the call if voicemail / an answering machine is detected
          </label>
        </CardContent>
      </Card>

      {/* Banned words */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ban size={16} /> Banned words
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-vq-text-lo">
            Terms the agent must never say. Screened before each spoken turn.
          </p>
          <label htmlFor="banned" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Prohibited terms (comma-separated)
            <textarea
              id="banned"
              value={bannedWords}
              onChange={(e) => setBannedWords(e.target.value)}
              placeholder="guarantee, refund, free money"
              className={cn(inputCls, 'min-h-[4rem]')}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-vq-text-lo text-xs">When a banned term is detected</span>
            <div className="flex gap-2">
              {BANNED_ACTIONS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAction(a.value)}
                  title={a.hint}
                  className={cn(
                    'flex-1 rounded-vq border px-3 py-2 text-sm',
                    bannedWordsAction === a.value
                      ? 'border-vq-violet bg-vq-violet/10 text-vq-text-hi'
                      : 'border-vq-border text-vq-text-lo hover:text-vq-text-hi',
                  )}
                >
                  {a.label}
                  <span className="mt-0.5 block text-[11px] text-vq-text-lo">{a.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button disabled={update.isPending} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save guards'}
        </Button>
        {saved && !update.isPending && <span className="text-sm text-vq-success">Saved ✓</span>}
        {update.isError && (
          <span className="text-sm text-vq-danger">{(update.error as Error).message}</span>
        )}
      </div>
    </>
  );
}
