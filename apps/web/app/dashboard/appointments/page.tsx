'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { CalendarCheck, CalendarClock, CalendarX, Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type AppointmentDto,
  useAppointmentStats,
  useAppointments,
  useBookAppointment,
  useSetAppointmentStatus,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

const TABS = ['BOOKED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED'] as const;

const STATUS_STYLE: Record<string, string> = {
  BOOKED: 'text-vq-cyan border-vq-cyan/40 bg-vq-cyan/10',
  RESCHEDULED: 'text-vq-warn border-vq-warn/40 bg-vq-warn/10',
  COMPLETED: 'text-vq-success border-vq-success/40 bg-vq-success/10',
  CANCELLED: 'text-vq-danger border-vq-danger/40 bg-vq-danger/10',
};

/** Appointments (Day 36): stat cards + status tabs + list, with in-app booking. */
export default function AppointmentsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<string>('BOOKED');
  const stats = useAppointmentStats();
  const list = useAppointments(tab);
  const [booking, setBooking] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-semibold text-xl text-vq-text-hi">{t('Appointments')}</h1>
        <Button size="sm" onClick={() => setBooking((v) => !v)}>
          <Plus size={16} /> {t('Book')}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t('Upcoming')}
          value={stats.data?.upcoming}
          icon={<CalendarClock size={16} />}
        />
        <Stat label={t('Booked')} value={stats.data?.booked} icon={<CalendarCheck size={16} />} />
        <Stat label={t('Completed')} value={stats.data?.completed} icon={<Check size={16} />} />
        <Stat label={t('Cancelled')} value={stats.data?.cancelled} icon={<CalendarX size={16} />} />
      </div>

      {booking && <BookForm onDone={() => setBooking(false)} />}

      {/* Status tabs — labels are enum DATA (BOOKED/…), rendered lowercased. */}
      <div className="flex gap-2">
        {TABS.map((tk) => (
          <button
            key={tk}
            type="button"
            onClick={() => setTab(tk)}
            className={cn(
              'rounded-vq-pill border px-3 py-1 text-sm capitalize',
              tab === tk
                ? 'border-vq-violet bg-vq-violet/10 text-vq-text-hi'
                : 'border-vq-border text-vq-text-lo hover:text-vq-text-hi',
            )}
          >
            {tk.toLowerCase()}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingCard rows={3} />
      ) : list.isError ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('No {status} appointments', { status: tab.toLowerCase() })} />
      ) : (
        <div className="flex flex-col gap-2">
          {list.data.map((a) => (
            <AppointmentRow key={a.id} appt={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value?: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="flex items-center gap-1 text-vq-text-lo text-xs">
          {icon} {label}
        </span>
        <span className="font-mono text-2xl text-vq-text-hi">{value ?? '—'}</span>
      </CardContent>
    </Card>
  );
}

function AppointmentRow({ appt }: { appt: AppointmentDto }) {
  const { t } = useI18n();
  const setStatus = useSetAppointmentStatus();
  const start = new Date(appt.startsAt);
  const when = start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const active = appt.status === 'BOOKED' || appt.status === 'RESCHEDULED';

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div>
          <p className="font-medium text-vq-text-hi">{appt.contactName ?? t('Unknown contact')}</p>
          <p className="text-vq-text-lo text-xs">{when}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-vq-pill border px-2 py-0.5 text-[11px]',
              STATUS_STYLE[appt.status] ?? 'border-vq-border text-vq-text-lo',
            )}
          >
            {appt.status.toLowerCase()}
          </span>
          {active && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus.mutate({ id: appt.id, status: 'COMPLETED' })}
              >
                {t('Complete')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus.mutate({ id: appt.id, status: 'CANCELLED' })}
              >
                {t('Cancel')}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BookForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const book = useBookAppointment();
  const [contactId, setContactId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  async function submit() {
    await book.mutateAsync({
      contactId,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    });
    onDone();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="text-sm text-vq-text-hi">{t('Book an appointment')}</p>
        <Input
          placeholder={t('Contact ID')}
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
        />
        <div className="flex gap-3">
          <label htmlFor="start" className="flex flex-1 flex-col gap-1 text-xs text-vq-text-lo">
            {t('Starts')}
            <Input
              id="start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label htmlFor="end" className="flex flex-1 flex-col gap-1 text-xs text-vq-text-lo">
            {t('Ends')}
            <Input
              id="end"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <p className="text-vq-text-lo text-xs">
          {t('Google Calendar 2-way sync activates once GOOGLE_OAUTH_* is configured.')}
        </p>
        {book.isError && <p className="text-xs text-vq-danger">{(book.error as Error).message}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!contactId || !startsAt || !endsAt || book.isPending}
            onClick={submit}
          >
            {book.isPending ? t('Booking…') : t('Book')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t('Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
