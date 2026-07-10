'use client';

import { languageLabel } from '@vocaliq/shared';
import {
  AgentAvatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Waveform,
  cn,
} from '@vocaliq/ui';
import { ArrowLeft, BookMarked, ClipboardCheck, Languages, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingCard } from '../../../../components/states';
import { StatusBadge, formatDuration, formatUsd } from '../../../../components/ui-bits';
import {
  type CallDetail,
  type CostBreakdown,
  type TranscriptSegment,
  useCall,
  useCallQaScores,
  useOperatorLanguage,
  useScoreCallNow,
  useTranscriptTranslation,
  useTranslateTranscript,
} from '../../../../lib/api';

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
              {/* Shared element: morphs from the call-row avatar (View Transitions API). */}
              <span style={{ viewTransitionName: `vt-call-avatar-${id}` }}>
                <AgentAvatar seed={data.agent.id} name={data.agent.name} size={40} />
              </span>
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

          {/* QA scoring (Day 43) */}
          {data.transcript ? <QaCard callId={id} /> : null}

          <CostCard cost={data.costBreakdown as CostBreakdown | null} />

          {data.transcript?.sources && data.transcript.sources.length > 0 ? (
            <SourcesCard transcript={data.transcript} />
          ) : null}

          <TranscriptCard
            callId={id}
            transcript={data.transcript}
            showClean={showClean}
            setShowClean={setShowClean}
            seekTo={seekTo}
          />
        </>
      )}
    </div>
  );
}

/**
 * Transcript with a clean/raw toggle AND a dual-language translation toggle (Day 88). "Translate"
 * renders the transcript in the operator's working language while the native transcript is preserved.
 */
function TranscriptCard({
  callId,
  transcript,
  showClean,
  setShowClean,
  seekTo,
}: {
  callId: string;
  transcript: CallDetail['transcript'];
  showClean: boolean;
  setShowClean: (fn: (v: boolean) => boolean) => void;
  seekTo: (ms: number) => void;
}) {
  const [translated, setTranslated] = useState(false);
  const lang = useOperatorLanguage();
  const target = lang.data?.targetLanguage ?? 'en';
  const stored = useTranscriptTranslation(callId, target, translated);
  const doTranslate = useTranslateTranscript(callId);

  const clean = transcript?.cleanSegments;
  const nativeSegs = showClean && clean && clean.length > 0 ? clean : (transcript?.segments ?? []);
  const translatedSegs = (stored.data?.segments ?? null) as TranscriptSegment[] | null;
  const segs = translated && translatedSegs ? translatedSegs : nativeSegs;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Transcript</CardTitle>
        <div className="flex items-center gap-2">
          {transcript && (
            <button
              type="button"
              onClick={async () => {
                if (!translated && !translatedSegs) await doTranslate.mutateAsync(target);
                setTranslated((v) => !v);
              }}
              disabled={doTranslate.isPending}
              className={cn(
                'flex items-center gap-1 rounded-vq-pill border px-2.5 py-1 text-xs',
                translated
                  ? 'border-vq-cyan/50 text-vq-cyan'
                  : 'border-vq-border text-vq-text-lo hover:text-vq-text-hi',
              )}
            >
              <Languages size={12} />
              {doTranslate.isPending
                ? 'Translating…'
                : translated
                  ? `In ${languageLabel(target)} · view original`
                  : `Translate → ${languageLabel(target)}`}
            </button>
          )}
          {clean && clean.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowClean((v) => !v)}
              className="rounded-vq-pill border border-vq-border px-2.5 py-1 text-vq-text-lo text-xs hover:text-vq-text-hi"
            >
              {showClean ? 'clean · raw' : 'raw · clean'}
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {segs && segs.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {segs.map((seg, i) => (
              <li key={`${seg.startMs}:${seg.speaker}:${i}`}>
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
                    {seg.speaker} · {formatDuration(Math.floor((seg.startMs ?? 0) / 1000))}
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

function QaCard({ callId }: { callId: string }) {
  const scores = useCallQaScores(callId);
  const scoreNow = useScoreCallNow(callId);
  const hasScores = scores.data && scores.data.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-vq-cyan" /> QA scores
        </CardTitle>
        <Button
          size="sm"
          variant="secondary"
          disabled={scoreNow.isPending}
          onClick={() => scoreNow.mutate()}
        >
          {scoreNow.isPending ? 'Scoring…' : hasScores ? 'Re-score' : 'Score now'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {scoreNow.isError && (
          <p className="text-vq-danger text-xs">{(scoreNow.error as Error).message}</p>
        )}
        {!hasScores ? (
          <p className="text-sm text-vq-text-lo">
            Not scored yet. Run a rubric with “Score now”, or configure sampling in QA scoring.
          </p>
        ) : (
          scores.data?.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-1.5 border-vq-border border-t pt-2 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-lg text-vq-text-hi">
                  {s.overall.toFixed(1)}
                  <span className="text-vq-text-lo text-xs"> /100</span>
                </span>
                <span className="text-vq-text-lo text-xs">{s.model}</span>
              </div>
              {s.criteria.map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-xs">
                  <span
                    className={c.score >= 0.5 ? 'text-vq-success' : 'text-vq-danger'}
                    aria-hidden
                  >
                    {c.score >= 0.5 ? '✓' : '✗'}
                  </span>
                  <span className="w-28 shrink-0 truncate text-vq-text-lo" title={c.key}>
                    {c.key}
                  </span>
                  <span className="text-vq-text-hi">
                    {c.reason || `${Math.round(c.score * 100)}%`}
                  </span>
                </div>
              ))}
            </div>
          ))
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
