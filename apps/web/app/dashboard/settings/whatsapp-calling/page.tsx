'use client';

import { WA_DAYS, type WhatsappCallSettings } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Switch } from '@vocaliq/ui';
import { Clock, PhoneCall, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorState, LoadingCard } from '../../../../components/states';
import { useSaveWhatsappCallSettings, useWhatsappCallSettings } from '../../../../lib/api';

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
 * WhatsApp Business Calling settings (WAC-05): when/how the tenant's WhatsApp line takes calls —
 * enable, call-button visibility + callback permission, business hours (timezone + weekly blocks),
 * codecs, and voicemail. Saves to the API which validates + syncs to Meta. Everything on by default.
 */
export default function WhatsAppCallingSettingsPage() {
  const query = useWhatsappCallSettings();
  const save = useSaveWhatsappCallSettings();
  const [s, setS] = useState<WhatsappCallSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.data) setS(query.data);
  }, [query.data]);

  function patch(p: Partial<WhatsappCallSettings>) {
    setS((cur) => (cur ? { ...cur, ...p } : cur));
    setSaved(false);
  }
  function patchHours(p: Partial<WhatsappCallSettings['hours']>) {
    setS((cur) => (cur ? { ...cur, hours: { ...cur.hours, ...p } } : cur));
    setSaved(false);
  }
  function patchVoicemail(p: Partial<WhatsappCallSettings['voicemail']>) {
    setS((cur) => (cur ? { ...cur, voicemail: { ...cur.voicemail, ...p } } : cur));
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
          <PhoneCall size={20} /> WhatsApp Calling
        </h1>
        <p className="text-sm text-vq-text-lo">
          Let customers call your AI agent on WhatsApp. Configure when your line is open, the call
          button, and voicemail. Saved changes sync to Meta.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <Row
            label="Enable WhatsApp calling"
            hint="Turn calling on for this number."
            control={<Switch checked={s.enabled} onCheckedChange={(v) => patch({ enabled: v })} />}
          />
          <Row
            label="Show the call button"
            hint="Off = users can’t start unsolicited calls (buttons/links still work)."
            control={
              <Switch
                checked={s.callIconVisibility === 'DEFAULT'}
                onCheckedChange={(v) =>
                  patch({ callIconVisibility: v ? 'DEFAULT' : 'DISABLE_ALL' })
                }
              />
            }
          />
          <Row
            label="Auto-ask callback permission"
            hint="When a user calls you, ask permission so you can call them back."
            control={
              <Switch
                checked={s.callbackPermission}
                onCheckedChange={(v) => patch({ callbackPermission: v })}
              />
            }
          />
          <Row
            label="G.711 codec (legacy interop)"
            hint="OPUS is always on; add G.711 only for PSTN-gateway interop."
            control={
              <Switch
                checked={s.additionalCodecs.length > 0}
                onCheckedChange={(v) => patch({ additionalCodecs: v ? ['PCMU', 'PCMA'] : [] })}
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock size={16} /> Business hours
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row
            label="Restrict to business hours"
            hint="Off = open 24×7. Outside hours users see chat / request-a-callback."
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
                <label htmlFor="wa-timezone" className="font-medium text-sm text-vq-text-hi">
                  Timezone (IANA)
                </label>
                <Input
                  id="wa-timezone"
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
                        next[i] = { ...b, dayOfWeek: e.target.value as (typeof WA_DAYS)[number] };
                        patchHours({ weekly: next });
                      }}
                      className={SELECT}
                    >
                      {WA_DAYS.map((d) => (
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voicemail</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row
            label="Enable voicemail"
            hint="Rejected/timed-out calls leave a voicemail → captured as a lead."
            control={
              <Switch
                checked={s.voicemail.enabled}
                onCheckedChange={(v) =>
                  patchVoicemail({ enabled: v, triggers: v ? ['REJECT', 'TIMEOUT'] : [] })
                }
              />
            }
          />
          {s.voicemail.enabled && (
            <label className="flex items-center gap-3 text-sm">
              <span className="text-vq-text-hi">Ring for</span>
              <input
                type="number"
                min={0}
                max={30}
                value={s.voicemail.timeoutSeconds}
                onChange={(e) => patchVoicemail({ timeoutSeconds: Number(e.target.value) })}
                className={`${SELECT} w-20`}
              />
              <span className="text-vq-text-lo">seconds before voicemail</span>
            </label>
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
