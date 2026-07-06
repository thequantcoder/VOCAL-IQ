'use client';

import { zonedWallClockToUtc } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { PhoneOutgoing } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type Callback,
  useCallbacks,
  useCancelCallback,
  useCreateCallback,
} from '../../../lib/api';

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'text-vq-cyan border-vq-cyan/40',
  dialing: 'text-vq-warn border-vq-warn/40',
  completed: 'text-vq-success border-vq-success/40',
  failed: 'text-vq-danger border-vq-danger/40',
  cancelled: 'text-vq-text-lo border-vq-border',
  missed: 'text-vq-danger border-vq-danger/40',
};

const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi';
const COMMON_TZ = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/**
 * Callbacks (Day 80). Caller-requested callbacks the system auto-dials at the requested time — in the
 * caller's timezone and only within legal calling hours. Schedule one here, or agents capture them in
 * a call via the Callback flow node.
 */
export default function CallbacksPage() {
  const callbacks = useCallbacks();
  const create = useCreateCallback();
  const cancel = useCancelCallback();
  const [scheduling, setScheduling] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <PhoneOutgoing size={20} /> Callbacks
          </h1>
          <p className="text-sm text-vq-text-lo">
            Call people back exactly when they asked — timezone-aware, within legal calling hours.
          </p>
        </div>
        <Button size="sm" onClick={() => setScheduling((v) => !v)}>
          Schedule callback
        </Button>
      </div>

      {scheduling && <ScheduleCallback create={create} onDone={() => setScheduling(false)} />}

      {callbacks.isLoading ? (
        <LoadingCard rows={3} />
      ) : callbacks.isError ? (
        <ErrorState
          message={(callbacks.error as Error).message}
          onRetry={() => callbacks.refetch()}
        />
      ) : !callbacks.data || callbacks.data.length === 0 ? (
        <EmptyState
          title="No callbacks yet"
          hint="Schedule one above, or add a Callback node to an agent flow."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {callbacks.data.map((c) => (
            <CallbackRow
              key={c.id}
              cb={c}
              onCancel={() => cancel.mutate(c.id)}
              cancelling={cancel.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleCallback({
  create,
  onDone,
}: {
  create: ReturnType<typeof useCreateCallback>;
  onDone: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [when, setWhen] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [note, setNote] = useState('');

  async function submit() {
    if (!phone || !when) return;
    // `when` is a wall-clock value; interpret it in the SELECTED caller timezone (not the operator's
    // browser timezone) to get the correct absolute instant.
    await create.mutateAsync({
      phone: phone.trim(),
      requestedAt: zonedWallClockToUtc(when, timezone).toISOString(),
      timezone,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule a callback</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Phone (E.164)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <label htmlFor="when" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            When
            <Input
              id="when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label htmlFor="tz" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Caller timezone
            <select
              id="tz"
              className={SELECT_CLS}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {COMMON_TZ.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {create.isError && (
          <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!phone || !when || create.isPending} onClick={submit}>
            {create.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CallbackRow({
  cb,
  onCancel,
  cancelling,
}: { cb: Callback; onCancel: () => void; cancelling: boolean }) {
  const when = new Date(cb.requestedAt).toLocaleString('en-US', { timeZone: cb.timezone });
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3 text-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-vq-text-hi">
            {cb.phone}
            <span
              className={`rounded-vq-pill border px-2 py-0.5 text-xs ${STATUS_COLOR[cb.status] ?? ''}`}
            >
              {cb.status}
            </span>
            {cb.attempts > 0 && (
              <span className="rounded-vq-pill border border-vq-border px-2 py-0.5 text-vq-text-lo text-xs">
                {cb.attempts} tries
              </span>
            )}
          </span>
          <span className="text-vq-text-lo text-xs">
            {when} ({cb.timezone}){cb.note ? ` · ${cb.note}` : ''}
          </span>
        </div>
        {cb.status === 'scheduled' && (
          <Button size="sm" variant="ghost" disabled={cancelling} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
