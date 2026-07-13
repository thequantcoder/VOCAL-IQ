import { describe, expect, it } from 'vitest';
import {
  formatSlackMessage,
  maskSlackUrl,
  slackEventEnabled,
  slackSettingsSchema,
} from './slack.js';

describe('slack helpers', () => {
  it('masks the secret path of a webhook URL', () => {
    expect(maskSlackUrl('https://hooks.slack.com/services/T1/B1/secret')).toBe(
      'https://hooks.slack.com/services/•••',
    );
    expect(maskSlackUrl(undefined)).toBeNull();
  });

  it('rejects a non-Slack webhook URL', () => {
    expect(slackSettingsSchema.safeParse({ webhookUrl: 'https://evil.test/x' }).success).toBe(
      false,
    );
    expect(
      slackSettingsSchema.safeParse({ webhookUrl: 'https://hooks.slack.com/services/a/b/c' })
        .success,
    ).toBe(true);
  });

  it('defaults events ON, honours explicit OFF, and denies when no URL', () => {
    const s = slackSettingsSchema.parse({
      webhookUrl: 'https://hooks.slack.com/services/a/b/c',
      events: { 'call.failed': false },
    });
    expect(slackEventEnabled(s, 'call.completed')).toBe(true); // default on
    expect(slackEventEnabled(s, 'call.failed')).toBe(false); // explicit off
    expect(slackEventEnabled(slackSettingsSchema.parse({}), 'call.completed')).toBe(false); // no URL
  });

  it('formats an event message with mrkdwn blocks', () => {
    const msg = formatSlackMessage('lead.created', { leadId: 'l1', phone: '+1555' });
    expect(msg.text).toContain('New lead created');
    expect(msg.text).toContain('+1555');
    expect(Array.isArray(msg.blocks)).toBe(true);
  });
});
