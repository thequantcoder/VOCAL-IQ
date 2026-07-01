'use client';

import { Card, CardContent, CardHeader, CardTitle, Waveform, cn } from '@vocaliq/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingCard } from '../../../../components/states';
import { StatusBadge, formatDuration, formatUsd } from '../../../../components/ui-bits';
import { type CostBreakdown, useCall } from '../../../../lib/api';

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, isError, error, refetch } = useCall(id);

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
            <audio controls src={data.recordingUrl} className="w-full">
              <track kind="captions" />
            </audio>
          ) : null}

          <CostCard cost={data.costBreakdown as CostBreakdown | null} />

          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {data.transcript && data.transcript.segments.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {data.transcript.segments.map((seg) => (
                    <li
                      key={`${seg.startMs}:${seg.endMs}:${seg.speaker}`}
                      className="flex flex-col gap-0.5"
                    >
                      <span
                        className={cn(
                          'font-medium text-xs uppercase tracking-wide',
                          seg.speaker === 'agent' ? 'text-vq-violet' : 'text-vq-cyan',
                        )}
                      >
                        {seg.speaker}
                      </span>
                      <span className="font-mono text-sm text-vq-text-hi">{seg.text}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-vq-text-lo">
                  No transcript yet — it’s captured live during the call.
                </p>
              )}
              {data.transcript?.summary ? (
                <p className="mt-4 border-vq-border border-t pt-3 text-sm text-vq-text-lo">
                  <span className="font-medium text-vq-text-hi">Summary. </span>
                  {data.transcript.summary}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
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
