import { z } from 'zod';

/**
 * Slack notifications (per-event). A tenant pastes a Slack Incoming Webhook URL (one-click "Add to
 * Slack" → channel picked there) and toggles which domain events post to it. Kept pure here (schema +
 * message formatting); the API stores the config in the tenant settings and posts best-effort.
 */

/** The domain events a Slack notification can fire on (the ones the platform actually emits). */
export const SLACK_EVENTS = ['call.completed', 'call.failed', 'lead.created'] as const;
export type SlackEvent = (typeof SLACK_EVENTS)[number];

export const SLACK_EVENT_LABELS: Record<SlackEvent, string> = {
  'call.completed': 'Call completed',
  'call.failed': 'Call failed',
  'lead.created': 'New lead created',
};

const slackEventsSchema = z
  .object({
    'call.completed': z.boolean(),
    'call.failed': z.boolean(),
    'lead.created': z.boolean(),
  })
  .partial();

export const slackSettingsSchema = z.object({
  /** A Slack Incoming Webhook URL (https://hooks.slack.com/services/...). Empty disables Slack. */
  webhookUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://hooks.slack.com/'), 'Must be a Slack incoming webhook URL')
    .optional()
    .or(z.literal('')),
  /** Per-event on/off. A missing event defaults to ON when a webhook URL is configured. */
  events: slackEventsSchema.default({}),
});
export type SlackSettings = z.infer<typeof slackSettingsSchema>;

/** True when this event should post to Slack given the tenant's settings. */
export function slackEventEnabled(settings: SlackSettings, event: SlackEvent): boolean {
  if (!settings.webhookUrl) return false;
  // Default ON unless explicitly turned off.
  return settings.events?.[event] !== false;
}

/** Mask a webhook URL for display (never echo the full secret path back to a client). */
export function maskSlackUrl(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/(\/services\/).+/, '$1•••');
}

/** Build the Slack message payload for a domain event (incoming-webhook `{ text, blocks }`). */
export function formatSlackMessage(
  event: SlackEvent,
  payload: Record<string, unknown>,
): { text: string; blocks: unknown[] } {
  const emoji =
    event === 'call.completed'
      ? ':telephone_receiver:'
      : event === 'call.failed'
        ? ':x:'
        : ':sparkles:';
  const title = `${emoji} VocalIQ — ${SLACK_EVENT_LABELS[event]}`;

  const lines: string[] = [];
  if (event === 'call.completed' || event === 'call.failed') {
    if (payload.disposition) lines.push(`*Disposition:* ${String(payload.disposition)}`);
    if (payload.status) lines.push(`*Status:* ${String(payload.status)}`);
    if (payload.durationSec != null) lines.push(`*Duration:* ${String(payload.durationSec)}s`);
    if (payload.callId) lines.push(`*Call:* ${String(payload.callId)}`);
  } else {
    if (payload.phone) lines.push(`*Phone:* ${String(payload.phone)}`);
    if (payload.leadId) lines.push(`*Lead:* ${String(payload.leadId)}`);
  }

  const body = lines.join('\n') || '_no details_';
  return {
    text: `${title}\n${body}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } },
      { type: 'section', text: { type: 'mrkdwn', text: body } },
    ],
  };
}
