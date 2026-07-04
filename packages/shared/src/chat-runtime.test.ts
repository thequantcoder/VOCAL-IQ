import { describe, expect, it } from 'vitest';
import {
  type ChatChannel,
  chatTurn,
  isTextChannel,
  renderForChannel,
  startChat,
} from './chat-runtime.js';
import type { CompiledFlow } from './flow-compiler.js';

/**
 * A small compiled flow: START → SAY → LISTEN(capture reason) → DECISION(intent) →
 * {booking END | else END}. The START line carries an SSML break to prove channel-aware
 * rendering. Built as a literal so the runtime is tested in isolation from the compiler.
 */
const FLOW: CompiledFlow = {
  entry: 'start',
  nodes: {
    start: {
      id: 'start',
      type: 'START',
      config: { openingLine: 'Hi, this is Ada.<break time="300ms"/> How can I help?' },
      captures: [],
      transitions: [{ target: 'ask', kind: 'always' }],
    },
    ask: {
      id: 'ask',
      type: 'SAY',
      config: { mode: 'scripted', text: 'What do you need today?' },
      captures: [],
      transitions: [{ target: 'listen', kind: 'always' }],
    },
    listen: {
      id: 'listen',
      type: 'LISTEN',
      config: {},
      captures: [{ name: 'reason', type: 'text', required: true }],
      transitions: [{ target: 'decide', kind: 'always' }],
    },
    decide: {
      id: 'decide',
      type: 'DECISION',
      config: {},
      captures: [],
      transitions: [
        { target: 'booked', kind: 'intent', expression: 'booking' },
        { target: 'bye', kind: 'else' },
      ],
    },
    booked: {
      id: 'booked',
      type: 'END',
      config: { outcome: 'booked' },
      captures: [],
      transitions: [],
    },
    bye: {
      id: 'bye',
      type: 'END',
      config: { outcome: 'no_booking' },
      captures: [],
      transitions: [],
    },
  },
};

/** Run the whole conversation on a channel with a single scripted user reply. */
function converse(channel: ChatChannel, reply: { text: string; intent?: string }) {
  const opened = startChat(FLOW, { channel });
  const turned = chatTurn(
    FLOW,
    opened.state,
    reply.text,
    reply.intent ? { intent: reply.intent } : {},
  );
  return {
    agentTexts: [...opened.messages, ...turned.messages]
      .filter((m) => m.role === 'agent')
      .map((m) => m.text),
    state: turned.state,
    opened,
    turned,
  };
}

describe('startChat', () => {
  it('runs the opening turns and stops awaiting user input at the Listen node', () => {
    const res = startChat(FLOW, { channel: 'CHAT' });
    expect(res.awaitingInput).toBe(true);
    expect(res.done).toBe(false);
    expect(res.messages.map((m) => m.text)).toEqual([
      'Hi, this is Ada. How can I help?', // SSML stripped for text
      'What do you need today?',
    ]);
    expect(res.state.activeNode).toBe('listen');
  });
});

describe('multimodal consistency (self-audit A)', () => {
  it('the SAME flow routes to the SAME outcome on voice, chat, and whatsapp', () => {
    const reply = { text: 'I want to book an appointment', intent: 'booking' };
    const voice = converse('VOICE', reply);
    const chat = converse('CHAT', reply);
    const wa = converse('WHATSAPP', reply);

    // Same conversational logic → same outcome + same captures on every channel.
    for (const c of [voice, chat, wa]) {
      expect(c.state.done).toBe(true);
      expect(c.state.outcome).toBe('booked');
      expect(c.state.captured.reason).toBe('I want to book an appointment');
    }
  });

  it('renders channel-appropriately: voice keeps SSML, text strips it', () => {
    const voice = converse('VOICE', { text: 'hi', intent: 'other' });
    const chat = converse('CHAT', { text: 'hi', intent: 'other' });
    expect(voice.agentTexts[0]).toContain('<break');
    expect(chat.agentTexts[0]).not.toContain('<break');
    // Same underlying content otherwise.
    expect(chat.agentTexts[0]).toBe('Hi, this is Ada. How can I help?');
  });
});

describe('chatTurn', () => {
  it('routes the else branch when the intent does not match', () => {
    const res = converse('CHAT', { text: 'just browsing', intent: 'other' });
    expect(res.state.outcome).toBe('no_booking');
  });

  it('is a no-op once the conversation is done', () => {
    const res = converse('CHAT', { text: 'book it', intent: 'booking' });
    const after = chatTurn(FLOW, res.state, 'anything');
    expect(after.messages).toEqual([]);
    expect(after.done).toBe(true);
  });
});

describe('renderForChannel + isTextChannel', () => {
  it('classifies channels and strips SSML for text only', () => {
    expect(isTextChannel('VOICE')).toBe(false);
    expect(isTextChannel('WHATSAPP')).toBe(true);
    expect(renderForChannel('Hello <break/> there', 'VOICE')).toBe('Hello <break/> there');
    expect(renderForChannel('Hello <break/> there', 'SMS')).toBe('Hello there');
  });
});

describe('channel-aware transfer node', () => {
  const TRANSFER_FLOW: CompiledFlow = {
    entry: 'start',
    nodes: {
      start: {
        id: 'start',
        type: 'START',
        config: { openingLine: 'One moment.' },
        captures: [],
        transitions: [{ target: 'xfer', kind: 'always' }],
      },
      xfer: {
        id: 'xfer',
        type: 'TRANSFER',
        config: { label: 'billing' },
        captures: [],
        transitions: [{ target: 'done', kind: 'always' }],
      },
      done: {
        id: 'done',
        type: 'END',
        config: { outcome: 'transferred' },
        captures: [],
        transitions: [],
      },
    },
  };
  it('surfaces a hand-off line on text but stays silent on voice', () => {
    const chat = startChat(TRANSFER_FLOW, { channel: 'CHAT' });
    expect(chat.messages.some((m) => m.text.includes('Connecting you to billing'))).toBe(true);
    const voice = startChat(TRANSFER_FLOW, { channel: 'VOICE' });
    expect(voice.messages.some((m) => m.text.includes('Connecting you'))).toBe(false);
  });
});
