import bcrypt from 'bcryptjs';

/**
 * Password hashing for self-hosted email/password auth (replaces Clerk). bcrypt is a
 * well-vetted, dependency-light, fully self-hostable choice — no third-party service.
 * Cost 10 is the standard balance of security vs. login latency.
 */
const BCRYPT_ROUNDS = 10;

/** Hash a plaintext password for storage in `User.passwordHash`. Never store plaintext. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Verify a plaintext password against a stored bcrypt hash (constant-time compare). */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
