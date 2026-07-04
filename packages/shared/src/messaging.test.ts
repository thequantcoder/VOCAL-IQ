import { describe, expect, it } from 'vitest';
import {
  type ChannelMix,
  blendedNextStep,
  classifyInbound,
  extractTemplateVars,
  messageCostUsd,
  messageTemplateInputSchema,
  renderMessageTemplate,
  smsSegments,
} from './messaging.js';

describe('messageTemplateInputSchema', () => {
  it('accepts a valid template and defaults language/category/active', () => {
    const t = messageTemplateInputSchema.parse({
      channel: 'SMS',
      name: 'appt_reminder',
      body: 'Hi {{name}}, your appointment is {{time}}.',
    });
    expect(t.language).toBe('en');
    expect(t.category).toBe('utility');
    expect(t.active).toBe(true);
  });
  it('rejects a non-snake_case name', () => {
    expect(() =>
      messageTemplateInputSchema.parse({ channel: 'SMS', name: 'Bad Name', body: 'hi' }),
    ).toThrow();
  });
});

describe('extractTemplateVars + renderMessageTemplate', () => {
  it('extracts distinct variable names in order', () => {
    expect(extractTemplateVars('Hi {{name}}, {{name}} — see {{link}}')).toEqual(['name', 'link']);
  });
  it('substitutes provided variables', () => {
    const r = renderMessageTemplate('Hi {{name}}, your link is {{link}}', {
      name: 'Sam',
      link: 'https://x.co/1',
    });
    expect(r.text).toBe('Hi Sam, your link is https://x.co/1');
    expect(r.missing).toEqual([]);
  });
  it('reports missing variables and blanks them (never ships {{var}})', () => {
    const r = renderMessageTemplate('Hi {{name}}, {{time}}', { name: 'Sam' });
    expect(r.text).toBe('Hi Sam, ');
    expect(r.missing).toEqual(['time']);
  });
});

describe('classifyInbound (opt-out/opt-in)', () => {
  it('detects opt-out keywords regardless of case/punctuation', () => {
    expect(classifyInbound('STOP')).toBe('opt_out');
    expect(classifyInbound('unsubscribe please')).toBe('opt_out');
    expect(classifyInbound('Stop.')).toBe('opt_out');
  });
  it('detects opt-in keywords', () => {
    expect(classifyInbound('START')).toBe('opt_in');
    expect(classifyInbound('yes')).toBe('opt_in');
  });
  it('treats a normal reply as a message', () => {
    expect(classifyInbound('What time is my appointment?')).toBe('message');
  });
});

describe('smsSegments + messageCostUsd', () => {
  it('counts SMS segments (160 then 153 each)', () => {
    expect(smsSegments('short')).toBe(1);
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(306))).toBe(2);
    expect(smsSegments('a'.repeat(307))).toBe(3);
  });
  it('prices SMS per segment and WhatsApp flat per message', () => {
    expect(messageCostUsd('SMS', 'a'.repeat(161))).toBeGreaterThan(messageCostUsd('SMS', 'hi'));
    expect(messageCostUsd('WHATSAPP', 'anything')).toBe(messageCostUsd('WHATSAPP', 'x'));
  });
});

describe('blendedNextStep', () => {
  const mix: ChannelMix = {
    voice: true,
    textFallbackOn: ['NO_ANSWER', 'VOICEMAIL'],
    textChannel: 'SMS',
    templateId: '00000000-0000-0000-0000-0000000000aa',
  };
  it('texts a no-answer with a configured template', () => {
    const step = blendedNextStep('NO_ANSWER', mix);
    expect(step).toEqual({ sendText: true, channel: 'SMS', templateId: mix.templateId });
  });
  it('does not text a completed call (no double-message)', () => {
    expect(blendedNextStep('COMPLETED', mix).sendText).toBe(false);
  });
  it('does not text when no template is configured', () => {
    expect(blendedNextStep('NO_ANSWER', { ...mix, templateId: null }).sendText).toBe(false);
  });
});
