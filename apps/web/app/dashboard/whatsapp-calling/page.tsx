'use client';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Waveform,
  buttonClasses,
} from '@vocaliq/ui';
import { StatCard } from '@vocaliq/ui/charts';
import { CheckCircle2, PhoneCall, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import Link from 'next/link';
import { ErrorState, LoadingCard } from '../../../components/states';
import { StatusBadge, formatDuration, formatUsd } from '../../../components/ui-bits';
import type { WhatsappCallRow } from '../../../lib/api';
import { useWhatsappCallOverview } from '../../../lib/api';
import { CallingHealth } from './calling-health';
import { ClickToCallGenerator } from './click-to-call-generator';
import { OutboundCallCard } from './outbound-call-card';

/**
 * WhatsApp Calling home (WAC-07) — the tenant's dashboard for AI voice calls over WhatsApp: a
 * status/setup hero, today's KPIs, this-month minutes + pricing tier, the recent-calls feed, and the
 * click-to-call generator. Gated: until calling is enabled, the hero is an onboarding CTA.
 */
export default function WhatsAppCallingPage() {
  const query = useWhatsappCallOverview();

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
          <PhoneIncoming size={20} /> WhatsApp Calling
        </h1>
        <p className="text-sm text-vq-text-lo">
          Let customers reach your AI agent with a tap on WhatsApp — inbound is free, worldwide.
        </p>
      </div>

      {enabled ? (
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 py-5">
            <div className="flex items-center justify-between">
              <Badge variant="success">
                <CheckCircle2 size={13} /> Calling enabled
              </Badge>
              <Link
                href="/dashboard/settings/whatsapp-calling"
                className="text-sm text-vq-violet hover:underline"
              >
                Edit settings
              </Link>
            </div>
            <Waveform bars={40} className="h-10 opacity-60" aria-hidden />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Calls today"
                value={stats.callsToday}
                icon={<PhoneCall size={15} />}
              />
              <StatCard
                label="Answered"
                value={stats.answeredToday}
                sentiment="good"
                icon={<CheckCircle2 size={15} />}
              />
              <StatCard label="Avg duration" value={stats.avgDurationSec} format={formatDuration} />
              <StatCard label="Cost today" value={stats.costTodayUsd} format={formatUsd} />
            </div>
            <p className="text-vq-text-lo text-xs">
              This month: <span className="text-vq-text-hi">{monthly.minutes} outbound min</span> ·
              pricing tier{' '}
              <span className="text-vq-text-hi">
                {monthly.tier === 'tier1' ? '1 (volume)' : '0'}
              </span>
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 py-6">
            <Badge variant="warn">Setup needed</Badge>
            <div>
              <h2 className="font-medium text-vq-text-hi">Turn on WhatsApp Calling</h2>
              <ol className="mt-2 flex flex-col gap-1 text-sm text-vq-text-lo">
                <li>1. Connect your WhatsApp Business number</li>
                <li>2. Enable calling + set your business hours</li>
                <li>3. Share your click-to-call link (below) and take a test call</li>
              </ol>
            </div>
            <Link href="/dashboard/settings/whatsapp-calling" className={buttonClasses('primary')}>
              Enable calling
            </Link>
          </CardContent>
        </Card>
      )}

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
              No WhatsApp calls yet — share your click-to-call link to get your first one.
            </p>
          ) : (
            <ul className="divide-y divide-vq-border">
              {recent.map((c) => (
                <CallRow key={c.waCallId} call={c} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {enabled ? <CallingHealth /> : null}

      {enabled ? <OutboundCallCard /> : null}

      <ClickToCallGenerator />
    </div>
  );
}

function CallRow({ call }: { call: WhatsappCallRow }) {
  const inbound = call.direction === 'USER_INITIATED';
  const who = inbound ? call.fromNumber : call.toNumber;
  return (
    <li>
      <Link
        href={`/dashboard/whatsapp-calling/live/${encodeURIComponent(call.waCallId)}`}
        className="-mx-2 flex items-center gap-3 rounded-vq px-2 py-2.5 transition-colors hover:bg-vq-bg-elevated"
      >
        <span className={inbound ? 'text-vq-success' : 'text-vq-violet'}>
          {inbound ? <PhoneIncoming size={16} /> : <PhoneOutgoing size={16} />}
        </span>
        <span className="flex-1 truncate text-sm text-vq-text-hi">{who ?? 'Unknown'}</span>
        <StatusBadge status={call.status} />
        <span className="w-14 text-right text-vq-text-lo text-xs">
          {formatDuration(call.durationSec)}
        </span>
        <span className="w-16 text-right text-vq-text-lo text-xs">
          {call.costUsd ? formatUsd(call.costUsd) : '—'}
        </span>
      </Link>
    </li>
  );
}
