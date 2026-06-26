import { describe, expect, it } from 'vitest';
import { extractBearerToken } from './token';

describe('extractBearerToken', () => {
  it('extracts a valid Bearer token (scheme case-insensitive)', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer xyz')).toBe('xyz');
  });

  it('returns null for missing/malformed headers', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('Token abc')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken('Bearer   ')).toBeNull();
  });
});
