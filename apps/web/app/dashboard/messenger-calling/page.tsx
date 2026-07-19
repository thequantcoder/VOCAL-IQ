'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, Waveform } from '@vocaliq/ui';
import { StatCard } from '@vocaliq/ui/charts';
import { CheckCircle2, MessageCircle, PhoneCall, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import Link from 'next/link';
import { ErrorState, LoadingCard } from '../../../components/states';
import { StatusBadge, formatDuration } from '../../../components/ui-bits';
import type { MessengerCallRow } from '../../../lib/api';
import { useMessengerCallOverview } from '../../../lib/api';
import { EntryPointGenerator } from './entry-point-generator';
import { OutboundCallCard } from './outbound-call-card';

/**
 * Messenger Calling home (MEC-07) — the tenant's dashboard for AI voice calls over Messenger: a
 * status hero, today's KPIs, this-month minutes, the recent-calls feed, and the m.me call-link
 * generator. Messenger inbound calling is free-tier; the hero shows whether the Page is connected.
 */
export default function MessengerCallingPage() {
  const query = useMessengerCallOverview();

  if (query.isLoading || !query.data) {
    return (
      <div className="mx-auto max-w-4xl">
        {query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : (
          <LoadingCard rows={5} />
        )}
      </div>
    );
  }

  const { enabled, stats, monthly, recent } = query.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <MessageCircle size={20} /> Messenger Calling
        </h1>
        <p className="text-sm text-vq-text-lo">
          Let customers reach your AI agent with a tap on Messenger — inbound is free.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex items-center justify-between">
            {enabled ? (
              <Badge variant="success">
                <CheckCircle2 size={13} /> Calling enabled
              </Badge>
            ) : (
              <Badge variant="warn">Setup needed</Badge>
            )}
            <Link
              href="/dashboard/settings/messenger-calling"
              className="text-sm text-vq-violet hover:underline"
            >
              Edit settings
            </Link>
          </div>
          <Waveform bars={40} className="h-10 opacity-60" aria-hidden />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Calls today" value={stats.callsToday} icon={<PhoneCall size={15} />} />
            <StatCard
              label="Answered"
              value={stats.answeredToday}
              sentiment="good"
              icon={<CheckCircle2 size={15} />}
            />
            <StatCard label="Avg duration" value={stats.avgDurationSec} format={formatDuration} />
            <StatCard label="This month" value={monthly.minutes} format={(v) => `${v} min`} />
          </div>
          {!enabled && (
            <p className="text-vq-text-lo text-xs">
              Subscribe your Page’s Messenger webhook to the calling events to start taking calls,
              then share your call link below.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent calls</CardTitle>
          <Link href="/dashboard/calls" className="text-sm text-vq-violet hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-vq-text-lo">
              No Messenger calls yet — share your call link to get your first one.
            </p>
          ) : (
            <ul className="divide-y divide-vq-border">
              {recent.map((c) => (
                <CallRow key={c.meCallId} call={c} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <OutboundCallCard />

      <EntryPointGenerator />
    </div>
  );
}

function CallRow({ call }: { call: MessengerCallRow }) {
  const inbound = call.direction === 'USER_INITIATED';
  return (
    <li>
      <Link
        href={`/dashboard/messenger-calling/live/${encodeURIComponent(call.meCallId)}`}
        className="-mx-2 flex items-center gap-3 rounded-vq px-2 py-2.5 transition-colors hover:bg-vq-bg-elevated"
      >
        <span className={inbound ? 'text-vq-success' : 'text-vq-violet'}>
          {inbound ? <PhoneIncoming size={16} /> : <PhoneOutgoing size={16} />}
        </span>
        <span className="flex-1 truncate text-sm text-vq-text-hi">
          {call.psid ? `User ${call.psid.slice(-6)}` : 'Unknown'}
        </span>
        <StatusBadge status={call.status} />
        <span className="w-14 text-right text-vq-text-lo text-xs">
          {formatDuration(call.durationSec)}
        </span>
      </Link>
    </li>
  );
}
