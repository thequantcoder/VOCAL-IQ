import { isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { authenticate } from './authenticate';
import type { ClerkClaims } from './clerk';

const fakeVerify = async (token: string): Promise<ClerkClaims> => {
  if (token === 'good') return { userId: 'user_123', sessionId: 'sess_1' };
  throw new Error('clerk rejected token');
};

describe('authenticate', () => {
  it('returns claims for a valid bearer token', async () => {
    const claims = await authenticate('Bearer good', fakeVerify);
    expect(claims.userId).toBe('user_123');
  });

  it('throws AuthError (401) when no token is present', async () => {
    await expect(authenticate(undefined, fakeVerify)).rejects.toSatisfy(
      (e) => isAppError(e) && e.status === 401,
    );
  });

  it('throws AuthError (401) when the token fails verification — reason stays internal', async () => {
    try {
      await authenticate('Bearer bad', fakeVerify);
      throw new Error('expected to reject');
    } catch (e) {
      expect(isAppError(e)).toBe(true);
      if (isAppError(e)) {
        expect(e.status).toBe(401);
        expect(e.safeMessage).toBe('Authentication required.');
        expect(e.safeMessage).not.toContain('clerk');
      }
    }
  });
});
