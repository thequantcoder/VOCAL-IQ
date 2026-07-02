import { describe, expect, it } from 'vitest';
import {
  ContextBus,
  type HandoffRule,
  entryAgent,
  resolveHandoff,
  resolveNodeOverride,
  squadConfigSchema,
} from './squad.js';

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b2';
const C = '00000000-0000-0000-0000-0000000000c3';

const rules: HandoffRule[] = [
  { fromAgentId: A, on: 'booking', toAgentId: B },
  { fromAgentId: B, on: 'billing', toAgentId: C },
];

describe('resolveHandoff', () => {
  it('routes to the matching specialist and null when no rule matches', () => {
    expect(resolveHandoff(rules, A, 'booking')).toBe(B);
    expect(resolveHandoff(rules, B, 'billing')).toBe(C);
    expect(resolveHandoff(rules, A, 'billing')).toBeNull(); // no rule from A on billing
    expect(resolveHandoff(rules, C, 'booking')).toBeNull();
  });
});

describe('ContextBus (shared context across handoffs)', () => {
  it('preserves what earlier specialists captured so nothing is re-asked', () => {
    const bus = new ContextBus();
    bus.merge({ caller_name: 'Ada', reason: 'appointment' }, A);
    bus.set('preferred_date', '2026-07-10', B);

    // The billing specialist sees everything the receptionist + booking captured.
    const snap = bus.snapshot();
    expect(snap).toEqual({
      caller_name: 'Ada',
      reason: 'appointment',
      preferred_date: '2026-07-10',
    });

    const handoff = bus.forHandoff(C);
    expect(handoff.toAgentId).toBe(C);
    expect(handoff.context.caller_name).toBe('Ada');
    expect(handoff.summary).toContain('caller name: Ada');
  });

  it('never stores empty values and seeds from a record', () => {
    const bus = new ContextBus({ tenant_plan: 'pro' }, 'system');
    bus.set('empty', '', A);
    bus.set('nil', null, A);
    expect(bus.has('empty')).toBe(false);
    expect(bus.has('nil')).toBe(false);
    expect(bus.get('tenant_plan')).toBe('pro');
  });
});

describe('entryAgent', () => {
  it('prefers the explicit entry, else the lowest-order member', () => {
    const cfg = squadConfigSchema.parse({
      members: [
        { agentId: A, role: 'reception', order: 2 },
        { agentId: B, role: 'booking', order: 1 },
      ],
      handoffRules: [],
    });
    expect(entryAgent(cfg)).toBe(B); // lowest order

    const withEntry = squadConfigSchema.parse({
      entryAgentId: A,
      members: [
        { agentId: A, role: 'reception', order: 2 },
        { agentId: B, role: 'booking', order: 1 },
      ],
      handoffRules: [],
    });
    expect(entryAgent(withEntry)).toBe(A);
  });
});

describe('squadConfigSchema validation', () => {
  it('rejects handoff rules that reference non-members', () => {
    const bad = squadConfigSchema.safeParse({
      members: [{ agentId: A, role: 'reception', order: 0 }],
      handoffRules: [{ fromAgentId: A, on: 'booking', toAgentId: B }], // B not a member
    });
    expect(bad.success).toBe(false);
  });
});

describe('resolveNodeOverride (per-node model/voice swap)', () => {
  it('uses the override when set, else the agent default', () => {
    const defaults = { model: 'gpt-4o-mini', voiceId: 'v-default' };
    expect(resolveNodeOverride({ modelOverride: 'gpt-4o' }, defaults)).toEqual({
      model: 'gpt-4o',
      voiceId: 'v-default',
    });
    expect(resolveNodeOverride({ voiceOverride: 'v-premium' }, defaults)).toEqual({
      model: 'gpt-4o-mini',
      voiceId: 'v-premium',
    });
    expect(resolveNodeOverride(undefined, defaults)).toEqual(defaults);
    expect(resolveNodeOverride({ modelOverride: '  ' }, defaults)).toEqual(defaults); // blank ignored
  });
});
