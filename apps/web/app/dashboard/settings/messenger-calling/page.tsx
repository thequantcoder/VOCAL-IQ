'use client';

import { ME_DAYS, type MessengerCallSettings } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Switch } from '@vocaliq/ui';
import { Clock, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorState, LoadingCard } from '../../../../components/states';
import { useMessengerCallSettings, useSaveMessengerCallSettings } from '../../../../lib/api';

const SELECT =
  'rounded-vq border border-vq-border bg-vq-bg-base px-2 py-1.5 text-sm text-vq-text-hi';
const DAY_LABEL: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

/** "0900" ↔ "09:00" for the time inputs. */
const toInput = (hhmm: string) => `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
const fromInput = (v: string) => v.replace(':', '').padEnd(4, '0').slice(0, 4);

/**
 * Messenger Calling settings (MEC-05): when/how the tenant's Page takes Messenger calls — enable, the
 * audio call-button visibility, and availability hours (timezone + weekly blocks). Saves to the API which
 * validates + syncs to Meta. Messenger has no phone numbers, so there are no country / codec / voicemail
 * / SIP options (unlike WhatsApp).
 */
export default function MessengerCallingSettingsPage() {
  const query = useMessengerCallSettings();
  const save = useSaveMessengerCallSettings();
  const [s, setS] = useState<MessengerCallSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.data) setS(query.data);
  }, [query.data]);

  function patch(p: Partial<MessengerCallSettings>) {
    setS((cur) => (cur ? { ...cur, ...p } : cur));
    setSaved(false);
  }
  function patchHours(p: Partial<MessengerCallSettings['hours']>) {
    setS((cur) => (cur ? { ...cur, hours: { ...cur.hours, ...p } } : cur));
    setSaved(false);
  }

  if (query.isLoading || !s) {
    return (
      <div className="mx-auto max-w-2xl">
        {query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : (
          <LoadingCard rows={4} />
        )}
      </div>
    );
  }

  const week = s.hours.weekly;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <MessageCircle size={20} /> Messenger Calling
        </h1>
        <p className="text-sm text-vq-text-lo">
          Let customers call your AI agent on Messenger. Configure when your Page is open and the
          call button. Saved changes sync to Meta.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <Row
            label="Enable Messenger calling"
            hint="Turn calling on for this Page."
            control={<Switch checked={s.enabled} onCheckedChange={(v) => patch({ enabled: v })} />}
          />
          <Row
            label="Show the call button"
            hint="Off = users can’t start unsolicited calls (m.me links still work)."
            control={
              <Switch
                checked={s.callButtonVisibility === 'DEFAULT'}
                onCheckedChange={(v) =>
                  patch({ callButtonVisibility: v ? 'DEFAULT' : 'DISABLE_ALL' })
                }
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock size={16} /> Availability hours
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row
            label="Restrict to availability hours"
            hint="Off = open 24×7. Outside hours callers are declined gracefully."
            control={
              <Switch
                checked={s.hours.enabled}
                onCheckedChange={(v) => patchHours({ enabled: v })}
              />
            }
          />
          {s.hours.enabled && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="me-timezone" className="font-medium text-sm text-vq-text-hi">
                  Timezone (IANA)
                </label>
                <Input
                  id="me-timezone"
                  value={s.hours.timezone}
                  onChange={(e) => patchHours({ timezone: e.target.value })}
                  placeholder="America/New_York"
                />
              </div>
              <div className="flex flex-col gap-2">
                {week.map((b, i) => (
                  <div key={`${b.dayOfWeek}-${i}`} className="flex items-center gap-2">
                    <select
                      value={b.dayOfWeek}
                      onChange={(e) => {
                        const next = [...week];
                        next[i] = { ...b, dayOfWeek: e.target.value as (typeof ME_DAYS)[number] };
                        patchHours({ weekly: next });
                      }}
                      className={SELECT}
                    >
                      {ME_DAYS.map((d) => (
                        <option key={d} value={d}>
                          {DAY_LABEL[d]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={toInput(b.openTime)}
                      onChange={(e) => {
                        const next = [...week];
                        next[i] = { ...b, openTime: fromInput(e.target.value) };
                        patchHours({ weekly: next });
                      }}
                      className={SELECT}
                    />
                    <span className="text-vq-text-lo text-xs">to</span>
                    <input
                      type="time"
                      value={toInput(b.closeTime)}
                      onChange={(e) => {
                        const next = [...week];
                        next[i] = { ...b, closeTime: fromInput(e.target.value) };
                        patchHours({ weekly: next });
                      }}
                      className={SELECT}
                    />
                    <button
                      type="button"
                      aria-label="Remove hours block"
                      onClick={() => patchHours({ weekly: week.filter((_, j) => j !== i) })}
                      className="ml-auto rounded-vq p-1 text-vq-text-lo hover:text-vq-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={week.length >= 14}
                  onClick={() =>
                    patchHours({
                      weekly: [
                        ...week,
                        { dayOfWeek: 'MONDAY', openTime: '0900', closeTime: '1700' },
                      ],
                    })
                  }
                >
                  <Plus size={14} /> Add hours (max 2 per day)
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={() => save.mutate(s, { onSuccess: () => setSaved(true) })}
        >
          Save settings
        </Button>
        {saved && <span className="text-vq-success text-sm">Saved ✓</span>}
        {save.isError && (
          <span className="text-vq-danger text-sm">{(save.error as Error).message}</span>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  control,
}: {
  label: string;
  hint: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col">
        <span className="font-medium text-sm text-vq-text-hi">{label}</span>
        <span className="text-vq-text-lo text-xs">{hint}</span>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}
