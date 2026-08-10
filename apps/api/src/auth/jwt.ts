import { AuthError } from '@vocaliq/shared';
import jwt from 'jsonwebtoken';

/**
 * Self-hosted JWT session tokens (replaces Clerk). We sign our own HS256 tokens with a
 * secret from env — no third-party auth service, fully self-hostable. The token subject
 * is the LOCAL `User.id`, so downstream tenant resolution needs no external lookup.
 */

export interface JwtClaims {
  /** Local User.id (the JWT `sub`). */
  userId: string;
  /**
   * Impersonation target (from the signed `act` claim). Present ONLY on a super-admin
   * impersonation grant — the token subject stays the ACTOR (the super-admin), so every action
   * taken while impersonating is attributed to them, not the impersonated owner (self-audit C).
   */
  actAsTenantId?: string;
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const IMPERSONATION_TTL_SECONDS = 30 * 60; // 30 min — short-lived by design

/** The signing secret — required in env; never hard-coded. Fail loudly if missing. */
function secret(): string {
  const s = process.env.APP_JWT_SECRET;
  if (!s || s.length < 16) {
    throw new AuthError('APP_JWT_SECRET is not set (min 16 chars) — required for self-hosted auth');
  }
  return s;
}

/** Issue a signed session token for a local user. */
export function signToken(userId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  return jwt.sign({ sub: userId }, secret(), { algorithm: 'HS256', expiresIn: ttlSeconds });
}

/**
 * Issue a short-lived impersonation grant: the subject is the ACTOR (super-admin) and the `act`
 * claim carries the target tenant. The API still verifies the actor is a SUPER_ADMIN when the
 * token is used, so a forged/replayed grant can't widen scope; the mint itself is audited by the
 * caller. Deliberately short TTL (30 min).
 */
export function signImpersonationToken(
  actorUserId: string,
  targetTenantId: string,
  ttlSeconds = IMPERSONATION_TTL_SECONDS,
): string {
  return jwt.sign({ sub: actorUserId, act: targetTenantId }, secret(), {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
  });
}

/**
 * Verify a session token and return trusted claims. Throws AuthError on any
 * invalid/expired/tampered token (→ 401 via the error middleware). Matches the
 * `TokenVerifier` shape so the existing `authenticate()` helper is reused unchanged.
 */
export async function verifyJwtToken(token: string): Promise<JwtClaims> {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
  } catch (cause) {
    throw new AuthError('Invalid or expired token', { cause });
  }
  if (typeof payload === 'string' || !payload.sub) {
    throw new AuthError('Malformed token payload');
  }
  const act = typeof payload.act === 'string' ? payload.act : undefined;
  return { userId: payload.sub, ...(act ? { actAsTenantId: act } : {}) };
}
