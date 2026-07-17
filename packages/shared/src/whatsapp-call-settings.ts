/**
 * WhatsApp Business Calling — call settings (WAC-05): the tenant-facing config for WHEN/HOW their
 * WhatsApp line takes calls (business hours + timezone + holidays, call-button visibility + country
 * limits, callback-permission auto-grant, codecs, voicemail). Stored in the tenant `settings` JSON
 * (the Slack-config pattern) and synced to Meta via the provider-router adapter. This module is the
 * pure core: the Zod schema, the Meta-shape mapper, and the timezone-aware "open now?" gate — all
 * unit-tested, no I/O. See `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` §A.6.
 */
import { z } from 'zod';

export const WA_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type WaDay = (typeof WA_DAYS)[number];

/** "HHMM" 24-hour, 0000–2359. */
const hhmm = z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/, 'time must be HHMM (0000–2359)');

export const whatsappCallHoursBlockSchema = z
  .object({
    dayOfWeek: z.enum(WA_DAYS),
    openTime: hhmm,
    closeTime: hhmm,
  })
  .refine((b) => b.openTime < b.closeTime, { message: 'openTime must be before closeTime' });

export const whatsappCallHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: hhmm.default('0000'),
  endTime: hhmm.default('2359'),
});

export const whatsappCallSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  callIconVisibility: z.enum(['DEFAULT', 'DISABLE_ALL']).default('DEFAULT'),
  restrictToCountries: z.array(z.string().length(2)).max(50).default([]),
  callbackPermission: z.boolean().default(false),
  additionalCodecs: z.array(z.enum(['PCMA', 'PCMU'])).default([]),
  hours: z
    .object({
      enabled: z.boolean().default(false),
      timezone: z.string().min(1).default('UTC'),
      // ≤2 blocks/day (enforced by superRefine below); each open<close (per-block refine).
      weekly: z.array(whatsappCallHoursBlockSchema).max(14).default([]),
      holidays: z.array(whatsappCallHolidaySchema).max(20).default([]),
    })
    .default({}),
  voicemail: z
    .object({
      enabled: z.boolean().default(false),
      triggers: z.array(z.enum(['REJECT', 'TIMEOUT'])).default([]),
      timeoutSeconds: z.number().int().min(0).max(30).default(20),
      announcementMediaId: z.string().optional(),
    })
    .default({}),
  // SIP mode (WAC-10) — mutually exclusive with Graph-API calling; for PBX (Asterisk/Kamailio) tenants.
  sip: z
    .object({
      enabled: z.boolean().default(false),
      servers: z
        .array(
          z.object({
            hostname: z.string().min(1).max(253),
            port: z.number().int().min(1).max(65535).default(5061),
            requestUriUserParams: z.record(z.string().max(40), z.string().max(120)).optional(),
          }),
        )
        .max(4)
        .default([]),
      webhookDelivery: z.boolean().default(false),
      srtpProtocol: z.enum(['DTLS', 'SDES']).default('DTLS'),
    })
    .default({}),
});
export type WhatsappCallSettings = z.infer<typeof whatsappCallSettingsSchema>;

/** Parse + enforce the cross-field rule: at most 2 weekly blocks per day. Throws on violation. */
export function parseWhatsappCallSettings(input: unknown): WhatsappCallSettings {
  const s = whatsappCallSettingsSchema.parse(input);
  const perDay = new Map<string, number>();
  for (const b of s.hours.weekly) perDay.set(b.dayOfWeek, (perDay.get(b.dayOfWeek) ?? 0) + 1);
  for (const [day, n] of perDay) {
    if (n > 2) throw new Error(`At most 2 calling-hour blocks per day (${day} has ${n})`);
  }
  if (s.voicemail.enabled && s.voicemail.triggers.length === 0) {
    throw new Error('Voicemail needs at least one trigger (REJECT and/or TIMEOUT)');
  }
  return s;
}

/** The `en-US`/24h weekday + "HHMM" for `date` in an IANA timezone (pure via Intl). */
function localDayAndTime(date: Date, timezone: string): { day: WaDay; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday').toUpperCase() as WaDay;
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
 * Is the WhatsApp line OPEN for calls at `now` (default: current time)? Hours disabled → always open
 * (24×7). Otherwise a holiday block for today wins; else any weekly block for the local day whose
 * window contains the local time. Timezone-correct via Intl.
 */
export function isWithinWhatsappCallHours(settings: WhatsappCallSettings, now: Date): boolean {
  const h = settings.hours;
  if (!h.enabled) return true;
  const tz = h.timezone || 'UTC';
  const today = localDate(now, tz);
  const { day, hhmm: nowHm } = localDayAndTime(now, tz);

  const holiday = h.holidays.find((x) => x.date === today);
  if (holiday) return nowHm >= holiday.startTime && nowHm < holiday.endTime;

  return h.weekly.some((b) => b.dayOfWeek === day && nowHm >= b.openTime && nowHm < b.closeTime);
}

/** Map our settings to Meta's `calling` block shape for the provider-router adapter (§A.6). */
export function toGraphCalling(s: WhatsappCallSettings): Record<string, unknown> {
  const calling: Record<string, unknown> = {
    status: s.enabled ? 'ENABLED' : 'DISABLED',
    call_icon_visibility: s.callIconVisibility,
    callback_permission_status: s.callbackPermission ? 'ENABLED' : 'DISABLED',
  };
  if (s.restrictToCountries.length > 0) {
    calling.call_icons = { restrict_to_user_countries: s.restrictToCountries };
  }
  if (s.additionalCodecs.length > 0) {
    calling.audio = { additional_codecs: s.additionalCodecs };
  }
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
  if (s.voicemail.enabled) {
    calling.voicemail = {
      status: 'ENABLED',
      triggers: s.voicemail.triggers,
      ...(s.voicemail.announcementMediaId
        ? {
            audio: {
              default: {
                announcement_media_id: s.voicemail.announcementMediaId,
                timeout_seconds: s.voicemail.timeoutSeconds,
              },
            },
          }
        : {}),
    };
  } else {
    calling.voicemail = { status: 'DISABLED' };
  }
  // SIP mode (WAC-10, §A.6). ENABLED strips Graph-API calling for the number (Meta hides webhooks).
  if (s.sip.enabled) {
    calling.sip = {
      status: 'ENABLED',
      srtp_key_exchange_protocol: s.sip.srtpProtocol,
      webhook_delivery: s.sip.webhookDelivery ? 'ENABLED' : 'DISABLED',
      servers: s.sip.servers.map((sv) => ({
        hostname: sv.hostname,
        port: sv.port,
        ...(sv.requestUriUserParams ? { request_uri_user_params: sv.requestUriUserParams } : {}),
      })),
    };
  } else {
    calling.sip = { status: 'DISABLED' };
  }
  return calling;
}
