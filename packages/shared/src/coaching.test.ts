import { describe, expect, it } from 'vitest';
import {
  type CoachSuggestion,
  assertAgentOnly,
  buildCoachMessages,
  detectObjections,
  draftDisposition,
  nextBestAction,
  sealAgentOnly,
} from './coaching.js';

describe('detectObjections (relevance — self-audit A)', () => {
  it('finds a price objection with a rebuttal hint', () => {
    const o = detectObjections('Honestly that sounds way too expensive for us right now');
    expect(o.map((x) => x.tag)).toContain('price');
    expect(o.find((x) => x.tag === 'price')?.rebuttal).toMatch(/value|ROI|tier/i);
  });

  it('detects multiple objections in one utterance, order-stable', () => {
    const o = detectObjections('I need to think about it and talk to my boss first');
    expect(o.map((x) => x.tag)).toEqual(['stall', 'authority']);
  });

  it('finds nothing in a neutral utterance', () => {
    expect(detectObjections('Sure, that makes sense, tell me more')).toEqual([]);
  });
});

describe('nextBestAction (pure priority)', () => {
  it('respects an opt-out above everything else', () => {
    expect(nextBestAction({ objections: ['price', 'brushoff'] }).action).toBe('respect_optout');
  });
  it('de-escalates on strongly negative sentiment before pitching', () => {
    expect(nextBestAction({ objections: ['price'], sentiment: -0.6 }).action).toBe('de_escalate');
  });
  it('asks for the close when a quote is on the table and nothing blocks', () => {
    expect(nextBestAction({ objections: [], hasQuote: true }).action).toBe('ask_for_close');
  });
  it('falls back to clarifying the need', () => {
    expect(nextBestAction({ objections: [] }).action).toBe('clarify_need');
  });
});

describe('draftDisposition (post-call draft, never auto-final)', () => {
  it('marks follow_up when objections were raised and flags it as an AI draft', () => {
    const d = draftDisposition({ durationSec: 200, objections: ['price'] });
    expect(d.disposition).toBe('follow_up');
    expect(d.note).toMatch(/AI draft/i);
    expect(d.note).toMatch(/price/);
  });
  it('marks not_interested on a brush-off and resolved when resolved', () => {
    expect(draftDisposition({ durationSec: 60, objections: ['brushoff'] }).disposition).toBe(
      'not_interested',
    );
    expect(draftDisposition({ durationSec: 60, objections: [], resolved: true }).disposition).toBe(
      'resolved',
    );
  });
});

describe('agent-only whisper guarantee (self-audit C — never spoken to caller)', () => {
  it('sealAgentOnly always stamps agent + whisper', () => {
    const s = sealAgentOnly({ kind: 'response', title: 'Try this', body: 'Reframe on value.' });
    expect(s.audience).toBe('agent');
    expect(s.channel).toBe('whisper');
    expect(() => assertAgentOnly(s)).not.toThrow();
  });

  it('assertAgentOnly throws for anything not agent-only whisper', () => {
    const leaked = {
      kind: 'response',
      audience: 'caller',
      channel: 'spoken',
      title: 'x',
      body: 'y',
      confidence: 0.5,
    } as unknown as CoachSuggestion;
    expect(() => assertAgentOnly(leaked)).toThrow(/leak to caller|agent-only/i);
  });
});

describe('buildCoachMessages (prompt assembly)', () => {
  it('restates the never-read-to-caller instruction and grounds on KB + objections', () => {
    const { system, user } = buildCoachMessages({
      turns: [
        { role: 'caller', text: 'This is too expensive' },
        { role: 'agent', text: 'I hear you' },
      ],
      objections: detectObjections('this is too expensive'),
      kb: [{ content: 'Pro tier is $49/mo with a 20% annual discount.', source: 'pricing.md' }],
    });
    expect(system).toMatch(/never.*(spoken|read).*caller/i);
    expect(user).toMatch(/Pro tier is \$49/);
    expect(user).toMatch(/Price objection/);
  });
});
