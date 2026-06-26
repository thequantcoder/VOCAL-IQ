import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { authenticate } from './authenticate';
import type { ClerkClaims } from './clerk';
import { verifyClerkToken } from './clerk';

/** Request augmented with the verified auth context (set by the guard). */
export interface AuthedRequest extends Request {
  auth?: ClerkClaims;
}

/**
 * Protects routes by requiring a valid Clerk session token. Verified claims are
 * attached to `req.auth` for `@CurrentUser()` to read. Deny-by-default: anything
 * this guards rejects without a valid token (CODING-RULES §6).
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    req.auth = await authenticate(req.headers.authorization, verifyClerkToken);
    return true;
  }
}
