import { describe, expect, it } from 'vitest';
import { matchBannedWords, redactBannedWords, screenSpeech } from './banned-words.js';

describe('matchBannedWords', () => {
  it('matches whole alphanumeric words case-insensitively, not substrings', () => {
    expect(matchBannedWords('What the HELL', ['hell'])).toEqual(['hell']);
    expect(matchBannedWords('hello there', ['hell'])).toEqual([]); // not a substring match
    expect(matchBannedWords('nothing here', ['hell'])).toEqual([]);
  });

  it('matches punctuated / multi-word phrases as substrings', () => {
    expect(matchBannedWords('call 1-800-SCAM now', ['1-800-scam'])).toEqual(['1-800-scam']);
    expect(matchBannedWords('our free money offer', ['free money'])).toEqual(['free money']);
  });

  it('ignores empty terms and returns distinct hits', () => {
    expect(matchBannedWords('bad bad bad', ['bad', '  '])).toEqual(['bad']);
  });
});

describe('redactBannedWords', () => {
  it('masks each occurrence length-hinted', () => {
    expect(redactBannedWords('say hell now', ['hell'])).toBe('say •••• now');
  });
});

describe('screenSpeech', () => {
  const words = ['refund', 'guarantee'];

  it('passes clean text through unflagged', () => {
    const r = screenSpeech('We can help you today', words, 'block');
    expect(r).toMatchObject({ flagged: false, blocked: false, text: 'We can help you today' });
  });

  it('flag: speaks as-is but reports matches', () => {
    const r = screenSpeech('I guarantee a refund', words, 'flag');
    expect(r.flagged).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.text).toBe('I guarantee a refund');
    expect(r.matched.sort()).toEqual(['guarantee', 'refund']);
  });

  it('redact: masks the banned terms', () => {
    const r = screenSpeech('I guarantee a refund', words, 'redact');
    expect(r.text).toBe('I ••••••••• a ••••••');
    expect(r.blocked).toBe(false);
  });

  it('block: suppresses the whole turn on any match', () => {
    const r = screenSpeech('I guarantee a refund', words, 'block');
    expect(r.blocked).toBe(true);
    expect(r.text).toBe('');
  });
});
