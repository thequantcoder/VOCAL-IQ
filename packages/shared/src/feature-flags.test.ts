import { describe, expect, it } from 'vitest';
import {
  type FlagEntry,
  flagInputSchema,
  isFlagEnabled,
  resolveAllFlags,
  resolveFlag,
} from './feature-flags.js';

const entries: FlagEntry[] = [
  { scope: 'GLOBAL', key: 'beta.dialer', value: false },
  { scope: 'PLAN', key: 'beta.dialer', value: true },
  { scope: 'GLOBAL', key: 'max.seats', value: 5 },
  { scope: 'TENANT', key: 'max.seats', value: 25 },
];

describe('flagInputSchema', () => {
  it('accepts a valid key + value and rejects a bad key', () => {
    expect(flagInputSchema.parse({ key: 'feature.x', value: true, scope: 'GLOBAL' }).value).toBe(
      true,
    );
    expect(() => flagInputSchema.parse({ key: 'Bad Key', value: true, scope: 'GLOBAL' })).toThrow();
  });
});

describe('resolveFlag (precedence TENANT > PLAN > GLOBAL)', () => {
  it('PLAN overrides GLOBAL', () => {
    expect(resolveFlag(entries, 'beta.dialer')).toBe(true);
  });
  it('TENANT overrides GLOBAL', () => {
    expect(resolveFlag(entries, 'max.seats')).toBe(25);
  });
  it('returns the fallback for an unknown key', () => {
    expect(resolveFlag(entries, 'nope', 'default')).toBe('default');
  });
});

describe('resolveAllFlags', () => {
  it('collapses to the highest-scope value per key', () => {
    expect(resolveAllFlags(entries)).toEqual({ 'beta.dialer': true, 'max.seats': 25 });
  });
});

describe('isFlagEnabled', () => {
  it('treats bool/number/string truthiness for gating', () => {
    expect(isFlagEnabled(true)).toBe(true);
    expect(isFlagEnabled(false)).toBe(false);
    expect(isFlagEnabled(0)).toBe(false);
    expect(isFlagEnabled(3)).toBe(true);
    expect(isFlagEnabled('false')).toBe(false);
    expect(isFlagEnabled('on')).toBe(true);
    expect(isFlagEnabled(undefined)).toBe(false);
  });
});
