'use client';

import { Card, CardContent, CardHeader, CardTitle, Waveform, cn } from '@vocaliq/ui';
import { ArrowLeft, BookMarked, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  const searchParams = useSearchParams();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showClean, setShowClean] = useState(true);

  /** Jump-to-moment: seek the recording to a segment's start and play. */
  function seekTo(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    void audio.play().catch(() => {});
  }

  // Deep-link from transcript search: /dashboard/calls/{id}?t={ms} seeks once loaded.
  const tParam = searchParams?.get('t');
  useEffect(() => {
    if (!tParam || !data?.recordingUrl) return;
    const ms = Number(tParam);
    if (!Number.isFinite(ms)) return;
    const audio = audioRef.current;
    if (!audio) return;
    const jump = () => {
      audio.currentTime = ms / 1000;
    };
    if (audio.readyState >= 1) jump();
    else audio.addEventListener('loadedmetadata', jump, { once: true });
  }, [tParam, data?.recordingUrl]);

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

          {data.transcript?.sources && data.transcript.sources.length > 0 ? (
            <SourcesCard transcript={data.transcript} />
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Transcript</CardTitle>
              {data.transcript?.cleanSegments && data.transcript.cleanSegments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowClean((v) => !v)}
                  className="rounded-vq-pill border border-vq-border px-2.5 py-1 text-vq-text-lo text-xs hover:text-vq-text-hi"
                >
                  {showClean ? 'Showing clean · view raw' : 'Showing raw · view clean'}
                </button>
              ) : null}
            </CardHeader>
            <CardContent>
              {(() => {
                const clean = data.transcript?.cleanSegments;
                const segs =
                  showClean && clean && clean.length > 0 ? clean : data.transcript?.segments;
                return segs && segs.length > 0 ? (
                  <ol className="flex flex-col gap-3">
                    {segs.map((seg) => (
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
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** RAG source attribution (Day 39): which KB chunks the agent drew on during the call. */
function SourcesCard({ transcript }: { transcript: NonNullable<CallDetail['transcript']> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookMarked size={16} className="text-vq-cyan" /> Knowledge sources
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {transcript.sources.map((s) => (
          <div key={s.chunkId} className="rounded-vq border border-vq-border p-3">
            <div className="mb-1 flex items-center justify-between text-vq-text-lo text-xs">
              <span>{s.kbName ?? 'Knowledge base'}</span>
              <span className="font-mono">match {Math.round(s.score * 100)}%</span>
            </div>
            <p className="text-sm text-vq-text-hi">{s.snippet}</p>
          </div>
        ))}
      </CardContent>
    </Card>
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
