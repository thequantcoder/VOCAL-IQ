/**
 * Unified notification preferences (FOLLOWUP) — a per-tenant event×channel matrix that acts as a
 * MASTER on/off gate in the domain-event fan-out, layered on top of each channel's own config
 * (webhook endpoint subscriptions, Slack per-event toggles). Only OVERRIDES are stored; the default
 * for every (event, channel) is ENABLED. Pure + unit-tested; the api reads/writes it in tenant settings.
 */
import { z } from 'zod';

/** Domain events that fan out to notification channels. */
export const NOTIFY_EVENTS = [
  'call.completed',
  'call.failed',
  'lead.created',
  'lead.status_changed',
  'campaign.finished',
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

/** Channels the domain-event emitter actually dispatches to (email/WhatsApp are campaign channels,
 *  not domain-event notifiers — they'd need a notify-destination model, tracked separately). */
export const NOTIFY_CHANNELS = ['webhook', 'slack'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** The subset of NOTIFY_EVENTS each channel can actually deliver (for an honest matrix UI). */
export const CHANNEL_EVENTS: Record<NotifyChannel, readonly NotifyEvent[]> = {
  webhook: NOTIFY_EVENTS,
  slack: ['call.completed', 'call.failed', 'lead.created'],
};

/** A stored preference key: `${event}:${channel}`. */
export function prefKey(event: string, channel: string): string {
  return `${event}:${channel}`;
}

/** Preferences are a sparse map of `event:channel` → enabled. Absent = default (enabled). */
export const notificationPrefsSchema = z.record(z.string(), z.boolean());
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/** Whether a channel is enabled for an event. Default ON unless explicitly set to false (fail-open). */
export function isNotificationEnabled(
  prefs: NotificationPrefs | null | undefined,
  event: string,
  channel: string,
): boolean {
  const v = prefs?.[prefKey(event, channel)];
  return v === undefined ? true : v;
}
