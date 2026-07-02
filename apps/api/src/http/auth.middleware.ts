import { AuthError } from '@vocaliq/shared';
import type { NextFunction, Response } from 'express';
import { verifyJwtToken } from '../auth/jwt';
import { extractBearerToken } from '../auth/token';
import type { AppRequest } from './context';

/**
 * Require a valid self-hosted JWT. Extracts the Bearer token, verifies it, and attaches
 * `req.auth` for downstream middleware/handlers. Deny-by-default: no/invalid token → 401
 * (via the error middleware). Replaces Nest's ClerkAuthGuard.
 */
export async function authMiddleware(
  req: AppRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) throw new AuthError('Missing bearer token');
    req.auth = await verifyJwtToken(token);
    next();
  } catch (err) {
    next(err);
  }
}
