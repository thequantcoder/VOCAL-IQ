'use client';

import { AgentAvatar, Card, CardContent, buttonClasses, cn } from '@vocaliq/ui';
import { LiveWaveform, activeSpeaker, useSimulatedAgent } from '@vocaliq/ui/voice';
import { ArrowLeft, Headphones, PhoneIncoming, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingCard } from '../../../../../components/states';
import { ChannelBadge, StatusBadge, formatDuration } from '../../../../../components/ui-bits';
import { type WhatsappCallContext, useWhatsappLiveCall } from '../../../../../lib/api';

/**
 * WhatsApp live-call view (WAC-04, DESIGN-SYSTEM §5c). The signature cyan waveform is the hero — it
 * pulses to the conversation while the call is live and everything else stays still (restraint rule
 * §4). Surfaces who's calling, the tapped-button context ("why they're calling"), the answering agent,
 * a talk/listen indicator, and a status timeline, with a one-tap "take over" into the Agent Desk. The
 * waveform + indicator are reduced-motion-safe (LiveWaveform paints a static level meter). Polls the
 * live status until the call ends. Live audio-reactive captions arrive with the live media bridge.
 */
export default function WhatsAppLiveCallPage() {
  const params = useParams<{ id: string }>();
  const waCallId = params?.id ?? '';
  const { data, isLoading, isError, error, refetch } = useWhatsappLiveCall(waCallId);

  // The call is "live" (audible) only once accepted; drive the waveform's envelope while it is.
  const isLive = data?.status === 'accepted';
  const agentState = useSimulatedAgent(isLive);
  const speaker = activeSpeaker(agentState);

  const caller = data?.fromNumber ?? data?.waUserId ?? 'Unknown caller';
  const contextItems = data ? contextRows(data.context) : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/dashboard/whatsapp-calling"
        className="flex items-center gap-1 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <ArrowLeft size={16} /> WhatsApp Calling
      </Link>

      {isLoading ? (
        <LoadingCard rows={5} />
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : !data ? (
        <ErrorState message="Call not found." />
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-vq-success">
                <PhoneIncoming size={20} />
              </span>
              <div className="flex flex-col">
                <span className="font-display font-semibold text-lg text-vq-text-hi">{caller}</span>
                <span className="text-vq-text-lo text-xs">
                  {data.direction === 'USER_INITIATED' ? 'inbound' : 'outbound'} ·{' '}
                  {formatDuration(data.durationSec)}
                </span>
              </div>
              <StatusBadge status={data.status} />
              <ChannelBadge channel="WHATSAPP" />
            </div>
            <Link href="/dashboard/desk" className={buttonClasses('secondary', 'sm')}>
              <Headphones size={15} /> Take over
            </Link>
          </header>

          {/* The hero — the cyan waveform is the one thing that moves (DESIGN-SYSTEM §5c). */}
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <div className="h-24 w-full max-w-md">
                <LiveWaveform
                  state={agentState}
                  bars={56}
                  label={`Live WhatsApp call with ${caller}`}
                />
              </div>
              <TalkIndicator live={isLive} speaker={speaker} />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Answering agent */}
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                {data.agent ? (
                  <>
                    <AgentAvatar seed={data.agent.id} name={data.agent.name} size={36} />
                    <div className="flex flex-col">
                      <span className="text-vq-text-lo text-xs">Answering agent</span>
                      <span className="font-medium text-sm text-vq-text-hi">{data.agent.name}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-vq-text-lo">Connecting an agent…</span>
                )}
              </CardContent>
            </Card>

            {/* Why they're calling — decoded from the tapped button / deep-link (real context). */}
            <Card>
              <CardContent className="flex flex-col gap-2 py-4">
                <span className="flex items-center gap-1.5 text-vq-text-lo text-xs">
                  <Sparkles size={13} /> Why they’re calling
                </span>
                {contextItems.length > 0 ? (
                  <dl className="flex flex-col gap-1 text-sm">
                    {contextItems.map((row) => (
                      <div key={row.label} className="flex justify-between gap-3">
                        <dt className="text-vq-text-lo">{row.label}</dt>
                        <dd className="truncate font-medium text-vq-text-hi">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-vq-text-lo">No context passed on this call.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Live captions — stream in once the media bridge is connected (WAC-03 live). */}
          <Card>
            <CardContent className="py-4">
              <span className="text-vq-text-lo text-xs">Live captions</span>
              <div
                className="mt-2 flex min-h-16 items-center justify-center rounded-vq-card border border-vq-border border-dashed bg-vq-bg-base p-4 text-center text-sm text-vq-text-lo"
                aria-live="polite"
              >
                {isLive
                  ? 'Listening… captions stream here as the conversation continues.'
                  : 'Captions will appear here once the caller connects.'}
              </div>
            </CardContent>
          </Card>

          {/* Status timeline — the lifecycle so far (real events, status only). */}
          {data.events.length > 0 ? (
            <Card>
              <CardContent className="py-4">
                <span className="text-vq-text-lo text-xs">Timeline</span>
                <ol className="mt-2 flex flex-col gap-1.5">
                  {data.events.map((e, i) => (
                    <li
                      key={`${e.event}-${i}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-vq-text-hi">{e.event.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-vq-text-lo text-xs">
                        {new Date(e.at).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The talk/listen chip — cyan "live" tones, but always paired with text (never colour-only, a11y §7). */
function TalkIndicator({
  live,
  speaker,
}: {
  live: boolean;
  speaker: 'agent' | 'caller' | null;
}) {
  const label = !live
    ? 'Waiting to connect'
    : speaker === 'agent'
      ? 'Agent speaking'
      : speaker === 'caller'
        ? 'Caller speaking'
        : 'Connected';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-vq-pill border px-3 py-1 text-xs',
        live ? 'border-vq-cyan/40 bg-vq-cyan/10 text-vq-cyan' : 'border-vq-border text-vq-text-lo',
      )}
      aria-live="polite"
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-vq-cyan' : 'bg-vq-text-lo')}
        aria-hidden
      />
      {label}
    </span>
  );
}

/** Flatten the decoded call context into labelled rows for the "why they're calling" callout. */
function contextRows(ctx: WhatsappCallContext): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (ctx.intent) rows.push({ label: 'Intent', value: ctx.intent });
  if (ctx.campaign) rows.push({ label: 'Campaign', value: ctx.campaign });
  if (ctx.reference) rows.push({ label: 'Reference', value: ctx.reference });
  for (const [k, v] of Object.entries(ctx.custom ?? {})) rows.push({ label: k, value: v });
  return rows;
}
