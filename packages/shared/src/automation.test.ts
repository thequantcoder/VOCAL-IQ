import { describe, expect, it } from 'vitest';
import {
  type AutomationEvent,
  actionLabel,
  automationInputSchema,
  matchesTrigger,
} from './automation.js';

describe('automationInputSchema', () => {
  it('parses a multi-step automation with defaults', () => {
    const a = automationInputSchema.parse({
      name: 'Missed-call follow-up',
      trigger: { event: 'call_ended', filters: { disposition: 'NO_ANSWER' } },
      actions: [
        { type: 'send_message', channel: 'SMS', body: 'Sorry we missed you!' },
        { type: 'crm_sync' },
        { type: 'task', title: 'Call back' },
      ],
    });
    expect(a.active).toBe(true);
    expect(a.actions).toHaveLength(3);
  });
  it('rejects an empty action list and an invalid webhook url', () => {
    expect(() =>
      automationInputSchema.parse({ name: 'x', trigger: { event: 'call_ended' }, actions: [] }),
    ).toThrow();
    expect(() =>
      automationInputSchema.parse({
        name: 'x',
        trigger: { event: 'call_ended' },
        actions: [{ type: 'webhook', url: 'not-a-url' }],
      }),
    ).toThrow();
  });
});

describe('matchesTrigger', () => {
  const base: AutomationEvent = {
    event: 'call_ended',
    disposition: 'NO_ANSWER',
    agentId: '00000000-0000-0000-0000-0000000000a1',
  };

  it('matches on event type when no filters are set (wildcard)', () => {
    expect(matchesTrigger({ event: 'call_ended', filters: {} }, base)).toBe(true);
  });
  it('does not match a different event type', () => {
    expect(matchesTrigger({ event: 'lead_status_changed', filters: {} }, base)).toBe(false);
  });
  it('ANDs filters: disposition + agent must both match', () => {
    expect(
      matchesTrigger({ event: 'call_ended', filters: { disposition: 'NO_ANSWER' } }, base),
    ).toBe(true);
    expect(matchesTrigger({ event: 'call_ended', filters: { disposition: 'BOOKED' } }, base)).toBe(
      false,
    );
    expect(
      matchesTrigger(
        { event: 'call_ended', filters: { agentId: '00000000-0000-0000-0000-0000000000ff' } },
        base,
      ),
    ).toBe(false);
  });
  it('matches a lead status change', () => {
    const evt: AutomationEvent = { event: 'lead_status_changed', leadStatus: 'HOT' };
    expect(
      matchesTrigger({ event: 'lead_status_changed', filters: { leadStatus: 'HOT' } }, evt),
    ).toBe(true);
    expect(
      matchesTrigger({ event: 'lead_status_changed', filters: { leadStatus: 'COLD' } }, evt),
    ).toBe(false);
  });
});

describe('actionLabel', () => {
  it('describes each action type', () => {
    expect(actionLabel({ type: 'send_message', channel: 'SMS' })).toContain('SMS');
    expect(actionLabel({ type: 'crm_sync' })).toBe('Sync to CRM');
    expect(actionLabel({ type: 'task', title: 'Call back' })).toContain('Call back');
    expect(actionLabel({ type: 'notify', message: 'hi' })).toContain('hi');
  });
});
