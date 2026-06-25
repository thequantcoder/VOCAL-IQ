import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults when optional vars are absent', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('accepts a valid configuration', () => {
    const env = parseEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h:5432/db' });
    expect(env.NODE_ENV).toBe('production');
    expect(env.DATABASE_URL).toBe('postgres://u:p@h:5432/db');
  });

  it('fails fast with a readable error on invalid values', () => {
    expect(() => parseEnv({ NODE_ENV: 'nope' })).toThrowError(/Invalid environment configuration/);
    expect(() => parseEnv({ DATABASE_URL: 'not-a-url' })).toThrowError(/DATABASE_URL/);
  });
});
