import { describe, expect, it } from 'vitest';
import {
  CHANNEL_EVENTS,
  NOTIFY_CHANNELS,
  NOTIFY_EVENTS,
  isNotificationEnabled,
  prefKey,
} from './notification-prefs.js';

describe('isNotificationEnabled', () => {
  it('defaults to ON when there is no preference (fail-open)', () => {
    expect(isNotificationEnabled(undefined, 'call.completed', 'slack')).toBe(true);
    expect(isNotificationEnabled({}, 'call.completed', 'webhook')).toBe(true);
  });

  it('honours an explicit off, and an explicit on', () => {
    const prefs = {
      [prefKey('call.completed', 'slack')]: false,
      [prefKey('lead.created', 'webhook')]: true,
    };
    expect(isNotificationEnabled(prefs, 'call.completed', 'slack')).toBe(false);
    expect(isNotificationEnabled(prefs, 'lead.created', 'webhook')).toBe(true);
    // an unrelated (event, channel) is still default-on
    expect(isNotificationEnabled(prefs, 'call.completed', 'webhook')).toBe(true);
  });
});

describe('catalog', () => {
  it('every channel’s deliverable events are a subset of NOTIFY_EVENTS', () => {
    for (const ch of NOTIFY_CHANNELS) {
      for (const ev of CHANNEL_EVENTS[ch]) {
        expect(NOTIFY_EVENTS).toContain(ev);
      }
    }
  });
});
