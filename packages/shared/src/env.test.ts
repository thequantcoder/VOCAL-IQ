import { describe, expect, it } from 'vitest';
import { parseEnv, requireEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults when optional vars are absent', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.VOICE_PORT).toBe(8000);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('accepts a valid configuration', () => {
    const env = parseEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h:5432/db' });
    expect(env.NODE_ENV).toBe('production');
    expect(env.DATABASE_URL).toBe('postgres://u:p@h:5432/db');
  });

  it('coerces numeric ports from strings', () => {
    const env = parseEnv({ API_PORT: '4000' });
    expect(env.API_PORT).toBe(4000);
  });

  it('fails fast with a readable error on invalid values', () => {
    expect(() => parseEnv({ NODE_ENV: 'nope' })).toThrowError(/Invalid environment configuration/);
    expect(() => parseEnv({ DATABASE_URL: 'not-a-url' })).toThrowError(/DATABASE_URL/);
  });

  it('never echoes the offending value in the error (no secret leak)', () => {
    const secret = 'super-secret-value-not-a-url';
    try {
      parseEnv({ SENTRY_DSN: secret });
      throw new Error('expected parseEnv to throw');
    } catch (e) {
      expect((e as Error).message).toContain('SENTRY_DSN');
      expect((e as Error).message).not.toContain(secret);
    }
  });
});

describe('requireEnv', () => {
  it('returns the requested keys when all present', () => {
    const env = parseEnv({ OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'ak-test' });
    const got = requireEnv(env, ['OPENAI_API_KEY'], 'LLM calls');
    expect(got.OPENAI_API_KEY).toBe('sk-test');
  });

  it('throws naming the feature and every missing var', () => {
    const env = parseEnv({});
    expect(() =>
      requireEnv(env, ['OPENAI_API_KEY', 'DEEPGRAM_API_KEY'], 'voice loop'),
    ).toThrowError(/voice loop: OPENAI_API_KEY, DEEPGRAM_API_KEY/);
  });

  it('treats empty string as missing', () => {
    const env = parseEnv({ OPENAI_API_KEY: '' });
    expect(() => requireEnv(env, ['OPENAI_API_KEY'])).toThrowError(/OPENAI_API_KEY/);
  });
});
