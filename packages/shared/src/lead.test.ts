import { describe, expect, it } from 'vitest';
import { canTransition, renderTemplate, scoreLead, templateVariables } from './lead.js';

describe('scoreLead (Hot/Warm/Cold)', () => {
  it('scores a ready + positive + booked call HOT', () => {
    const r = scoreLead({
      intent: 'ready',
      sentiment: 'positive',
      outcome: 'booked',
      talkSeconds: 180,
    });
    expect(r.temperature).toBe('HOT');
    expect(r.score).toBeGreaterThanOrEqual(65);
  });

  it('scores a neutral mid call WARM', () => {
    const r = scoreLead({ intent: 'interested', sentiment: 'neutral', outcome: 'callback' });
    expect(r.temperature).toBe('WARM');
  });

  it('scores a not-interested / no-answer call COLD', () => {
    const r = scoreLead({ intent: 'not_interested', sentiment: 'negative', outcome: 'no_answer' });
    expect(r.temperature).toBe('COLD');
    expect(r.score).toBeLessThan(35);
  });

  it('is monotonic and clamped 0..100, and deterministic', () => {
    const a = scoreLead({
      intent: 'ready',
      sentiment: 'positive',
      outcome: 'booked',
      talkSeconds: 9999,
    });
    const b = scoreLead({
      intent: 'ready',
      sentiment: 'positive',
      outcome: 'booked',
      talkSeconds: 9999,
    });
    expect(a).toEqual(b);
    expect(a.score).toBeLessThanOrEqual(100);
    const cold = scoreLead({});
    expect(cold.score).toBeGreaterThanOrEqual(0);
  });
});

describe('renderTemplate (dynamic vars)', () => {
  it('injects variables and never leaks unknown placeholders', () => {
    const out = renderTemplate('Hi {{name}}, your {{plan}} renews {{date}}.', {
      name: 'Ada',
      plan: 'Pro',
    });
    expect(out).toBe('Hi Ada, your Pro renews .'); // unknown → fallback ''
  });

  it('respects a custom fallback and stringifies values', () => {
    expect(renderTemplate('Balance: {{amt}}', { amt: 42 }, 'N/A')).toBe('Balance: 42');
    expect(renderTemplate('Owner: {{owner}}', {}, 'unassigned')).toBe('Owner: unassigned');
  });

  it('lists referenced variables', () => {
    expect(templateVariables('{{a}} and {{ b }} and {{a}}')).toEqual(['a', 'b']);
  });
});

describe('canTransition (pipeline)', () => {
  it('allows valid moves and blocks invalid ones', () => {
    expect(canTransition('NEW', 'CONTACTED')).toBe(true);
    expect(canTransition('QUALIFIED', 'BOOKED')).toBe(true);
    expect(canTransition('NEW', 'BOOKED')).toBe(false); // must qualify/contact first
    expect(canTransition('BOOKED', 'NEW')).toBe(false);
    expect(canTransition('LOST', 'NEW')).toBe(true); // reopen
    expect(canTransition('NEW', 'INVALID')).toBe(false);
    expect(canTransition('NEW', 'NEW')).toBe(true);
  });
});
