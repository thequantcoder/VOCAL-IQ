/**
 * Messenger (Meta) Calling — call settings (MEC-05): the tenant-facing config for WHEN/HOW their Page
 * takes Messenger calls (availability hours + timezone + holidays, and the audio call-button visibility).
 * Stored in the tenant `settings` JSON (RLS-scoped) and synced to Meta via the provider-router adapter.
 * This is the pure core: the Zod schema, the Meta-shape mapper, and the timezone-aware "open now?" gate —
 * all unit-tested, no I/O. The WhatsApp `whatsapp-call-settings.ts` sibling, trimmed: Messenger has NO
 * phone numbers → no per-country restriction, no extra codecs, and no SIP mode. The exact Meta `calling`
 * settings field names are `[CONFIRM @ MEC-00]` and live only in {@link toGraphMessengerCalling}.
 */
import { z } from 'zod';

export const ME_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type MeDay = (typeof ME_DAYS)[number];

/** "HHMM" 24-hour, 0000–2359. */
const hhmm = z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/, 'time must be HHMM (0000–2359)');

export const messengerCallHoursBlockSchema = z
  .object({
    dayOfWeek: z.enum(ME_DAYS),
    openTime: hhmm,
    closeTime: hhmm,
  })
  .refine((b) => b.openTime < b.closeTime, { message: 'openTime must be before closeTime' });

export const messengerCallHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: hhmm.default('0000'),
  endTime: hhmm.default('2359'),
});

export const messengerCallSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Show or hide the audio call button on the Page (Meta's call-icon visibility). */
  callButtonVisibility: z.enum(['DEFAULT', 'DISABLE_ALL']).default('DEFAULT'),
  hours: z
    .object({
      enabled: z.boolean().default(false),
      timezone: z.string().min(1).default('UTC'),
      // ≤2 blocks/day (enforced by parseMessengerCallSettings); each open<close (per-block refine).
      weekly: z.array(messengerCallHoursBlockSchema).max(14).default([]),
      holidays: z.array(messengerCallHolidaySchema).max(20).default([]),
    })
    .default({}),
});
export type MessengerCallSettings = z.infer<typeof messengerCallSettingsSchema>;

/** Parse + enforce the cross-field rule: at most 2 weekly blocks per day. Throws on violation. */
export function parseMessengerCallSettings(input: unknown): MessengerCallSettings {
  const s = messengerCallSettingsSchema.parse(input);
  const perDay = new Map<string, number>();
  for (const b of s.hours.weekly) perDay.set(b.dayOfWeek, (perDay.get(b.dayOfWeek) ?? 0) + 1);
  for (const [day, n] of perDay) {
    if (n > 2) throw new Error(`At most 2 calling-hour blocks per day (${day} has ${n})`);
  }
  return s;
}

/** The `en-US`/24h weekday + "HHMM" for `date` in an IANA timezone (pure via Intl). */
function localDayAndTime(date: Date, timezone: string): { day: MeDay; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday').toUpperCase() as MeDay;
  // Intl may render midnight hour as "24"; normalise to "00".
  const hour = get('hour') === '24' ? '00' : get('hour').padStart(2, '0');
  return { day, hhmm: `${hour}${get('minute').padStart(2, '0')}` };
}

/** The `YYYY-MM-DD` for `date` in an IANA timezone. */
function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Is the Page OPEN for Messenger calls at `now`? Hours disabled → always open (24×7). Otherwise a holiday
 * block for today wins; else any weekly block for the local day whose window contains the local time.
 * Timezone-correct via Intl.
 */
export function isWithinMessengerCallHours(settings: MessengerCallSettings, now: Date): boolean {
  const h = settings.hours;
  if (!h.enabled) return true;
  const tz = h.timezone || 'UTC';
  const today = localDate(now, tz);
  const { day, hhmm: nowHm } = localDayAndTime(now, tz);

  const holiday = h.holidays.find((x) => x.date === today);
  if (holiday) return nowHm >= holiday.startTime && nowHm < holiday.endTime;

  return h.weekly.some((b) => b.dayOfWeek === day && nowHm >= b.openTime && nowHm < b.closeTime);
}

/**
 * Map our settings to Meta's Messenger `calling` block shape for the provider-router adapter. Field names
 * mirror the documented WhatsApp sibling and are `[CONFIRM @ MEC-00]` for Messenger — this is the ONE
 * place they live, so confirming them changes only this function.
 */
export function toGraphMessengerCalling(s: MessengerCallSettings): Record<string, unknown> {
  const calling: Record<string, unknown> = {
    status: s.enabled ? 'ENABLED' : 'DISABLED',
    call_icon_visibility: s.callButtonVisibility,
  };
  if (s.hours.enabled) {
    calling.call_hours = {
      status: 'ENABLED',
      timezone_id: s.hours.timezone,
      weekly_operating_hours: s.hours.weekly.map((b) => ({
        day_of_week: b.dayOfWeek,
        open_time: b.openTime,
        close_time: b.closeTime,
      })),
      holiday_schedule: s.hours.holidays.map((x) => ({
        date: x.date,
        start_time: x.startTime,
        end_time: x.endTime,
      })),
    };
  } else {
    calling.call_hours = { status: 'DISABLED' };
  }
  return calling;
}
