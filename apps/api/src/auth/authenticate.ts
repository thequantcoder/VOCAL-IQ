import { AuthError } from '@vocaliq/shared';
import type { ClerkClaims, TokenVerifier } from './clerk';
import { extractBearerToken } from './token';

/**
 * Core auth check, decorator-free so it unit-tests without Nest DI: pull the Bearer
 * token, verify it, and return trusted claims. Any failure becomes an AuthError
 * (→ 401 via the global exception filter); the underlying reason is kept internal.
 */
export async function authenticate(
  authHeader: string | undefined,
  verify: TokenVerifier,
): Promise<ClerkClaims> {
  const token = extractBearerToken(authHeader);
  if (!token) throw new AuthError('Missing bearer token');
  try {
    return await verify(token);
  } catch (cause) {
    throw new AuthError('Invalid or expired token', { cause });
  }
}
