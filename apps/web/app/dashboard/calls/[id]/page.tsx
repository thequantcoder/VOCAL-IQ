'use client';

import { Card, CardContent, CardHeader, CardTitle, Waveform, cn } from '@vocaliq/ui';
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef } from 'react';
import { ErrorState, LoadingCard } from '../../../../components/states';
import { StatusBadge, formatDuration, formatUsd } from '../../../../components/ui-bits';
import { type CallDetail, type CostBreakdown, useCall } from '../../../../lib/api';

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'text-vq-success border-vq-success/40 bg-vq-success/10',
  neutral: 'text-vq-text-lo border-vq-border',
  negative: 'text-vq-danger border-vq-danger/40 bg-vq-danger/10',
};

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, isError, error, refetch } = useCall(id);
  const audioRef = useRef<HTMLAudioElement>(null);

  /** Jump-to-moment: seek the recording to a segment's start and play. */
  function seekTo(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    void audio.play().catch(() => {});
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/dashboard/calls"
        className="flex items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> Calls
      </Link>

      {isLoading ? (
        <LoadingCard rows={4} />
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : !data ? (
        <ErrorState message="Call not found." />
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="font-display font-semibold text-xl text-vq-text-hi">
                {data.agent.name}
              </h1>
              <StatusBadge status={data.status} />
            </div>
            <span className="font-mono text-vq-text-lo text-xs">
              {data.direction.toLowerCase()} · {data.channel.toLowerCase()} ·{' '}
              {formatDuration(data.durationSec)}
            </span>
          </header>

          <div className="h-14 w-full max-w-sm">
            <Waveform label={`Call with ${data.agent.name}`} bars={28} />
          </div>

          {data.recordingUrl ? (
            <audio ref={audioRef} controls src={data.recordingUrl} className="w-full">
              <track kind="captions" />
            </audio>
          ) : null}

          {/* Post-call intelligence (Day 31) */}
          {data.transcript?.intelAt ? <IntelCard transcript={data.transcript} /> : null}

          <CostCard cost={data.costBreakdown as CostBreakdown | null} />

          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {data.transcript && data.transcript.segments.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {data.transcript.segments.map((seg) => (
                    <li key={`${seg.startMs}:${seg.endMs}:${seg.speaker}`}>
                      <button
                        type="button"
                        onClick={() => seekTo(seg.startMs)}
                        title="Jump to this moment"
                        className="flex w-full flex-col gap-0.5 rounded-vq px-2 py-1 text-left hover:bg-vq-bg-elevated"
                      >
                        <span
                          className={cn(
                            'font-medium text-xs uppercase tracking-wide',
                            seg.speaker === 'agent' ? 'text-vq-violet' : 'text-vq-cyan',
                          )}
                        >
                          {seg.speaker} · {formatDuration(Math.floor(seg.startMs / 1000))}
                        </span>
                        <span className="font-mono text-sm text-vq-text-hi">{seg.text}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-vq-text-lo">
                  No transcript yet — it’s captured live during the call.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function IntelCard({ transcript }: { transcript: NonNullable<CallDetail['transcript']> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={16} className="text-vq-violet" /> Call intelligence
          {transcript.sentiment && (
            <span
              className={cn(
                'ml-auto rounded-vq-pill border px-2 py-0.5 text-[11px]',
                SENTIMENT_STYLE[transcript.sentiment] ?? SENTIMENT_STYLE.neutral,
              )}
            >
              {transcript.sentiment}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {transcript.summary && <p className="text-sm text-vq-text-hi">{transcript.summary}</p>}
        {transcript.keywords.length > 0 && <TagRow label="Keywords" tags={transcript.keywords} />}
        {transcript.topics.length > 0 && <TagRow label="Topics" tags={transcript.topics} />}
        {transcript.entities.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-vq-text-lo text-xs uppercase tracking-wide">Entities</span>
            <div className="flex flex-wrap gap-1.5">
              {transcript.entities.map((e) => (
                <span
                  key={`${e.type}:${e.value}`}
                  className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-xs text-vq-text-lo"
                >
                  <span className="text-vq-text-hi">{e.value}</span>
                  <span className="text-vq-text-lo"> · {e.type}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-vq-text-lo text-xs uppercase tracking-wide">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-vq-pill border border-vq-violet/30 bg-vq-violet/5 px-2 py-0.5 text-xs text-vq-text-hi"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function CostCard({ cost }: { cost: CostBreakdown | null }) {
  const rows: [string, number][] = cost
    ? [
        ['STT', cost.stt],
        ['LLM', cost.llm],
        ['TTS', cost.tts],
        ['Telephony', cost.telephony],
      ]
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Cost</span>
          <span className="font-mono text-base text-vq-text-hi">
            {formatUsd(cost?.billable ?? 0)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-vq-text-lo text-xs">{label}</dt>
              <dd className="font-mono text-sm text-vq-text-hi">{formatUsd(value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
