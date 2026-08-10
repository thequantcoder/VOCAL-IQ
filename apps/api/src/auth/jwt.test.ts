import { isAppError } from '@vocaliq/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { signToken, verifyJwtToken } from './jwt';

/** Self-hosted JWT session tokens (stack pivot — replaces Clerk). */

beforeAll(() => {
  process.env.APP_JWT_SECRET = 'test-secret-at-least-16-chars-long';
});

describe('signToken / verifyJwtToken', () => {
  it('round-trips a user id', async () => {
    const token = signToken('user-123');
    const claims = await verifyJwtToken(token);
    expect(claims.userId).toBe('user-123');
  });

  it('rejects a tampered token', async () => {
    const token = `${signToken('user-123')}tampered`;
    await expect(verifyJwtToken(token)).rejects.toSatisfy(isAppError);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = signToken('user-123');
    process.env.APP_JWT_SECRET = 'a-completely-different-secret-value';
    await expect(verifyJwtToken(token)).rejects.toSatisfy(isAppError);
    process.env.APP_JWT_SECRET = 'test-secret-at-least-16-chars-long'; // restore
  });

  it('rejects an expired token', async () => {
    const token = signToken('user-123', -1); // already expired
    await expect(verifyJwtToken(token)).rejects.toSatisfy(isAppError);
  });
});
