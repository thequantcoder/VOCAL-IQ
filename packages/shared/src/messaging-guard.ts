import { z } from 'zod';

/**
 * Unified messaging send-gate primitives (GME-15) — the pure, web-safe parts of the single choke point
 * every send routes through: the deny reasons, the per-tenant quiet-hours config, and the (approximate)
 * recipient-local-time computation used to enforce TCPA-style quiet hours. The stateful gates (consent,
 * opt-out, DNC/suppression) live in the api `MessagingGuard`, which composes these with DB reads.
 */

/** Why a send was refused — surfaced to the caller + logged (never a silent drop). */
export type MessagingGateReason = 'opted_out' | 'suppressed' | 'dnc' | 'no_consent' | 'quiet_hours';

export interface MessagingGateResult {
  allowed: boolean;
  reason?: MessagingGateReason;
}

/**
 * Per-tenant quiet-hours window (recipient local time). Default is the US TCPA window 8am–9pm; a
 * message is blocked OUTSIDE `[startHour, endHour)`. `enabled` is opt-in so transactional sends are
 * unaffected until a tenant turns it on (the consent-driven follow-up path opts in explicitly).
 */
export const messagingQuietHoursSchema = z.object({
  enabled: z.boolean().default(false),
  startHour: z.number().int().min(0).max(23).default(8),
  endHour: z.number().int().min(0).max(23).default(21),
});
export type MessagingQuietHours = z.infer<typeof messagingQuietHoursSchema>;

// Representative UTC offset (minutes) by E.164 country prefix — ordered longest-prefix-first so the
// find() below picks the most specific match. Approximate (a country can span zones); good enough for a
// courtesy quiet-hours gate, and a precise phone→timezone lookup can replace it later.
const COUNTRY_OFFSET_MINUTES: { prefix: string; offset: number }[] = [
  { prefix: '+971', offset: 240 }, // UAE  (GST)
  { prefix: '+91', offset: 330 }, // India (IST)
  { prefix: '+65', offset: 480 }, // Singapore
  { prefix: '+61', offset: 600 }, // Australia (AEST)
  { prefix: '+49', offset: 60 }, // Germany (CET)
  { prefix: '+44', offset: 0 }, // UK (GMT)
  { prefix: '+1', offset: -300 }, // North America (representative: US Eastern)
];

/** Best-effort UTC offset (minutes) for a phone number's country; 0 (UTC) when unknown. */
export function phoneUtcOffsetMinutes(phone: string): number {
  const match = COUNTRY_OFFSET_MINUTES.find((c) => phone.startsWith(c.prefix));
  return match?.offset ?? 0;
}

/**
 * Is it currently "quiet" (outside the allowed window) at the recipient's local time? `now` is UTC;
 * `offsetMinutes` shifts it to local. Blocked when the local hour is before `startHour` or at/after
 * `endHour` (e.g. 8–21 blocks 21:00–07:59).
 */
export function isQuietTime(
  now: Date,
  offsetMinutes: number,
  qh: { startHour: number; endHour: number },
): boolean {
  const raw = (now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMinutes) % 1440;
  const localMinutes = raw < 0 ? raw + 1440 : raw;
  const hour = Math.floor(localMinutes / 60);
  return hour < qh.startHour || hour >= qh.endHour;
}
