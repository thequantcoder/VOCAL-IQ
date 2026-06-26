import { createClerkClient, verifyToken } from '@clerk/backend';
import { requireEnv } from '@vocaliq/shared';
import { parseEnv } from '@vocaliq/shared';

/** Verified session claims we rely on (Clerk session JWT). */
export interface ClerkClaims {
  /** Clerk user id (the JWT `sub`). */
  userId: string;
  sessionId?: string;
}

/** Lazily built Clerk client (server SDK) — used for user lookups in /me. */
let client: ReturnType<typeof createClerkClient> | undefined;

export function clerkClient(): ReturnType<typeof createClerkClient> {
  if (client) return client;
  const env = parseEnv();
  const { CLERK_SECRET_KEY } = requireEnv(env, ['CLERK_SECRET_KEY'], 'Clerk auth');
  client = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  return client;
}

/**
 * Verify a Clerk session token and return the trusted claims. Throws if the token
 * is missing/expired/invalid — the guard turns that into a 401. The secret key is
 * read from env (never hard-coded) and used to fetch Clerk's JWKS for verification.
 */
export async function verifyClerkToken(token: string): Promise<ClerkClaims> {
  const env = parseEnv();
  const { CLERK_SECRET_KEY } = requireEnv(env, ['CLERK_SECRET_KEY'], 'Clerk auth');
  const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
  return { userId: payload.sub, sessionId: payload.sid };
}

/** The verifier signature — injected into the guard so tests can substitute a fake. */
export type TokenVerifier = (token: string) => Promise<ClerkClaims>;
