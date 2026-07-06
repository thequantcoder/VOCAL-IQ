'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Headphones, PhoneIncoming } from 'lucide-react';
import { useState } from 'react';
import { CoachPanel } from '../../../components/coach-panel';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import { useDeskQueue, useSetPresence } from '../../../lib/api';

const PRESENCE: { key: 'available' | 'away' | 'busy'; label: string; color: string }[] = [
  { key: 'available', label: 'Available', color: 'text-vq-success border-vq-success/40' },
  { key: 'busy', label: 'Busy', color: 'text-vq-warn border-vq-warn/40' },
  { key: 'away', label: 'Away', color: 'text-vq-text-lo border-vq-border' },
];

/**
 * Agent Desk (Day 67): the human-agent surface. Set availability, watch the transfer queue with
 * live wait times + SLA breaches, and take escalated calls. The live audio takeover joins the
 * existing LiveKit room (the realtime layer); this page owns presence + queue + wrap-up.
 */
export default function DeskPage() {
  const queue = useDeskQueue();
  const setPresence = useSetPresence();
  const [status, setStatus] = useState<'available' | 'away' | 'busy'>('away');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Headphones size={20} /> Agent Desk
          </h1>
          <p className="text-sm text-vq-text-lo">
            Take escalated calls. Set yourself available to join the routing pool.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My availability</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {PRESENCE.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={setPresence.isPending}
              onClick={() => {
                setStatus(p.key);
                setPresence.mutate({ status: p.key });
              }}
              className={`rounded-vq-pill border px-3 py-1.5 text-sm ${
                status === p.key ? p.color : 'border-vq-border text-vq-text-lo'
              }`}
            >
              {p.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <PhoneIncoming size={16} /> Transfer queue
            </span>
            {queue.data && (
              <span className="text-vq-text-lo text-xs">
                {queue.data.waiting} waiting
                {queue.data.breached > 0 && (
                  <span className="text-vq-danger"> · {queue.data.breached} SLA breach</span>
                )}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {queue.isLoading ? (
            <LoadingCard rows={2} />
          ) : queue.isError ? (
            <ErrorState message={(queue.error as Error).message} onRetry={() => queue.refetch()} />
          ) : !queue.data || queue.data.items.length === 0 ? (
            <EmptyState title="No calls waiting" hint="Escalated calls will ring here." />
          ) : (
            <div className="flex flex-col divide-y divide-vq-border">
              {queue.data.items.map((it) => (
                <div key={it.callId} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-vq-text-hi text-xs">
                      {it.callId.slice(0, 8)}
                    </span>
                    <span className={it.slaBreached ? 'text-vq-danger' : 'text-vq-text-lo'}>
                      {it.waitSeconds}s waiting
                    </span>
                    {it.assigned && (
                      <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                        ringing you
                      </span>
                    )}
                  </div>
                  <Button size="sm" disabled={it.assigned && false}>
                    {it.assigned ? 'Answer' : 'Claim'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Whisper copilot for the call this agent is on (the assigned one, else the first waiting). */}
      {(() => {
        const active = queue.data?.items.find((it) => it.assigned) ?? queue.data?.items[0];
        return active ? (
          <CoachPanel callId={active.callId} />
        ) : (
          <EmptyState
            title="Copilot stands by"
            hint="When you take a call, live AI suggestions and KB answers appear here — visible only to you."
          />
        );
      })()}
    </div>
  );
}
