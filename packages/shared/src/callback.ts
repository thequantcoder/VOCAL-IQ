import { z } from 'zod';
import { type CallWindow, isWithinWindow } from './campaign.js';

/**
 * Caller-requested callbacks (Day 80) — pure domain shared across api/workers/voice/web.
 *
 * A caller (or a no-answer) asks to be called back at a chosen time; the scheduler auto-dials then.
 * Two properties are non-negotiable and encoded here:
 *  - A (timezone/scheduling, self-audit A): the requested time is a UTC instant paired with the
 *    caller's IANA timezone, and the due-check evaluates the legal calling window IN THAT TIMEZONE —
 *    a callback asked for 2am is held until the window opens, never dialed early.
 *  - C (calling rules, self-audit C): a callback is only ever due INSIDE the legal calling window
 *    (default 8am–9pm local, TCPA-safe), so honouring a caller's request can never break calling law.
 * Everything is pure + deterministic (time is injected), so it unit-tests exactly.
 */

export const CALLBACK_STATUSES = [
  'scheduled',
  'dialing',
  'completed',
  'failed',
  'cancelled',
  'missed',
] as const;
export type CallbackStatus = (typeof CALLBACK_STATUSES)[number];

/** Is `tz` a real IANA timezone Intl can use? Guards against a bad string stalling the dialer. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a wall-clock datetime (e.g. an HTML `datetime-local` value "2026-07-01T15:00") interpreted
 * IN `timeZone` to the correct UTC instant. Dependency-free: guess the wall-clock as if it were UTC,
 * measure that timezone's offset there (via `Intl.formatToParts`), and correct. This is how the UI
 * turns "3pm in the caller's timezone" into the right absolute time regardless of the operator's own
 * browser timezone (self-audit A). Falls back to plain parsing for an invalid timezone.
 */
export function zonedWallClockToUtc(wallClock: string, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) return new Date(wallClock);
  const m = wallClock.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(wallClock);
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

/** The signed offset (ms) of `timeZone` from UTC at instant `at` — via numeric Intl parts (locale-safe). */
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const p: Record<string, string> = {};
  for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return asIfUtc - at.getTime();
}

export const callbackRequestSchema = z.object({
  phone: z.string().min(3).max(32),
  /** The UTC instant the caller wants to be called (the flow/API resolves local→UTC). */
  requestedAt: z.coerce.date(),
  /** Caller's IANA timezone — decides which local calling window applies. Rejected if not a real zone. */
  timezone: z
    .string()
    .min(1)
    .max(64)
    .default('UTC')
    .refine(isValidTimeZone, 'must be a valid IANA timezone'),
  note: z.string().max(500).optional(),
  contactId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  callId: z.string().uuid().optional(),
});
export type CallbackRequest = z.infer<typeof callbackRequestSchema>;

/** How a missed callback is retried before giving up. */
export const callbackRetrySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  retryAfterMinutes: z.number().int().min(1).max(1440).default(30),
});
export type CallbackRetry = z.infer<typeof callbackRetrySchema>;
export const DEFAULT_CALLBACK_RETRY: CallbackRetry = callbackRetrySchema.parse({});

/**
 * The legal calling RULES applied to every callback (days + local hours), independent of timezone —
 * the callback supplies its own timezone. Default: every day, 8am–9pm local (TCPA-safe). A tenant can
 * pass tighter rules; the window can only ever narrow when the callback is due.
 */
export type CallingRules = Pick<CallWindow, 'days' | 'startMinute' | 'endMinute'>;
export const DEFAULT_CALLING_RULES: CallingRules = {
  days: [0, 1, 2, 3, 4, 5, 6],
  startMinute: 8 * 60,
  endMinute: 21 * 60,
};

export interface DueCallback {
  id: string;
  requestedAt: Date;
  /** Set when a prior attempt missed — the callback waits until this retry time. */
  nextAttemptAt: Date | null;
  timezone: string;
  status: CallbackStatus;
}

/**
 * Is this callback due to dial right now? True only when it's still `scheduled`, its requested time
 * (or retry time) has arrived, AND `now` is inside the caller's legal calling window — evaluated in
 * the callback's own timezone. A callback requested for 2am is held until the window opens (self-audit
 * A + C). Pure + deterministic.
 */
export function isCallbackDue(
  cb: DueCallback,
  now: Date,
  rules: CallingRules = DEFAULT_CALLING_RULES,
): boolean {
  if (cb.status !== 'scheduled') return false;
  // A bad timezone must never crash the dialer sweep; such a callback is simply never due (safe).
  if (!isValidTimeZone(cb.timezone)) return false;
  const dueAt =
    cb.nextAttemptAt && cb.nextAttemptAt.getTime() > cb.requestedAt.getTime()
      ? cb.nextAttemptAt
      : cb.requestedAt;
  if (now.getTime() < dueAt.getTime()) return false;
  return isWithinWindow(now, { ...rules, timezone: cb.timezone });
}

export type CallbackAttemptDecision =
  | { action: 'retry'; nextAttemptAt: Date; attempt: number }
  | { action: 'give_up' };

/**
 * Decide what happens after a missed callback attempt. `attempts` INCLUDES the one that just missed.
 * Retries `retryAfterMinutes` later until `maxAttempts` is reached, then gives up (→ `missed`). Pure.
 */
export function nextCallbackAttempt(
  attempts: number,
  now: Date,
  retry: CallbackRetry = DEFAULT_CALLBACK_RETRY,
): CallbackAttemptDecision {
  if (attempts >= retry.maxAttempts) return { action: 'give_up' };
  return {
    action: 'retry',
    nextAttemptAt: new Date(now.getTime() + retry.retryAfterMinutes * 60_000),
    attempt: attempts + 1,
  };
}

/**
 * CALLBACK flow node (Day 80): the agent offers a callback and captures a preferred time. The captured
 * time (a Listen variable) is resolved to a UTC instant + timezone by the runtime; `defaultLeadMinutes`
 * is the fallback offset from now when the caller gives no specific time ("just call me back later").
 */
export const callbackNodeConfigSchema = z.object({
  offerPrompt: z.string().max(500).default('Would you like us to call you back at a better time?'),
  captureVariable: z.string().max(60).default('callback_time'),
  defaultLeadMinutes: z.number().int().min(0).max(10_080).default(60),
});
export type CallbackNodeConfig = z.infer<typeof callbackNodeConfigSchema>;
