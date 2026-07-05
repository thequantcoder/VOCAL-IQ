import { describe, expect, it } from 'vitest';
import {
  type DeskAgent,
  buildWarmSummary,
  pickDeskAgent,
  presenceInputSchema,
  summarizeQueue,
} from './agent-desk.js';

function agent(id: string, over: Partial<DeskAgent> = {}): DeskAgent {
  return {
    membershipId: id,
    userId: `u-${id}`,
    status: 'available',
    skills: [],
    lastAssignedAt: null,
    activeCalls: 0,
    ...over,
  };
}

describe('presenceInputSchema', () => {
  it('validates status + skills', () => {
    expect(presenceInputSchema.parse({ status: 'available' }).skills).toEqual([]);
    expect(() => presenceInputSchema.parse({ status: 'nope' })).toThrow();
  });
});

describe('pickDeskAgent (routing)', () => {
  it('round-robin picks the least-recently-assigned available agent', () => {
    const agents = [
      agent('a', { lastAssignedAt: 1000 }),
      agent('b', { lastAssignedAt: null }), // never assigned → highest priority
      agent('c', { lastAssignedAt: 500 }),
    ];
    expect(pickDeskAgent(agents, { strategy: 'round_robin' })?.membershipId).toBe('b');
  });

  it('skips away/busy and at-capacity agents', () => {
    const agents = [
      agent('a', { status: 'away' }),
      agent('b', { activeCalls: 1 }), // at cap
      agent('c', { lastAssignedAt: 10 }),
    ];
    expect(pickDeskAgent(agents, { strategy: 'round_robin' })?.membershipId).toBe('c');
  });

  it('skill routing requires the skill (else no misroute)', () => {
    const agents = [agent('a', { skills: ['billing'] }), agent('b', { skills: ['sales'] })];
    expect(
      pickDeskAgent(agents, { strategy: 'skill', requiredSkill: 'billing' })?.membershipId,
    ).toBe('a');
    expect(pickDeskAgent(agents, { strategy: 'skill', requiredSkill: 'legal' })).toBeNull();
  });

  it('specific routing targets one agent when available', () => {
    const agents = [agent('a'), agent('b')];
    expect(
      pickDeskAgent(agents, { strategy: 'specific', specificMembershipId: 'b' })?.membershipId,
    ).toBe('b');
    expect(
      pickDeskAgent([agent('a', { status: 'busy' })], {
        strategy: 'specific',
        specificMembershipId: 'a',
      }),
    ).toBeNull();
  });

  it('returns null when nobody is available (→ queue/fallback)', () => {
    expect(pickDeskAgent([agent('a', { status: 'away' })], { strategy: 'round_robin' })).toBeNull();
  });
});

describe('buildWarmSummary', () => {
  it('composes a spoken context summary', () => {
    const s = buildWarmSummary({
      contactName: 'Jane',
      leadScore: 82,
      reason: 'billing dispute',
      aiSummary: 'wants a refund',
    });
    expect(s).toContain('Jane');
    expect(s).toContain('82');
    expect(s).toContain('billing dispute');
    expect(s).toContain('wants a refund');
  });
});

describe('summarizeQueue (SLA)', () => {
  const now = 100_000;
  it('flags unassigned waits over the SLA + reports the longest', () => {
    const q = summarizeQueue(
      [
        {
          callId: 'c1',
          waitStartedAt: now - 45_000,
          handoffType: 'cold',
          assignedMembershipId: null,
        }, // 45s > 30
        {
          callId: 'c2',
          waitStartedAt: now - 10_000,
          handoffType: 'cold',
          assignedMembershipId: null,
        }, // 10s
        {
          callId: 'c3',
          waitStartedAt: now - 60_000,
          handoffType: 'warm',
          assignedMembershipId: 'm1',
        }, // assigned → not breached
      ],
      now,
    );
    expect(q.waiting).toBe(2);
    expect(q.breached).toBe(1);
    expect(q.longestWaitSeconds).toBe(45);
  });
});
