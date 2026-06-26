import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role, isAppError } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { RolesGuard } from './roles.guard';
import type { TenantContext } from './tenant-context';

/** Minimal ExecutionContext stub exposing a request with a resolved tenant role. */
function contextFor(role: Role | undefined): ExecutionContext {
  const tenant: TenantContext | undefined =
    role === undefined ? undefined : { userId: 'u', tenantId: 't', role };
  return {
    switchToHttp: () => ({ getRequest: () => ({ tenant }) }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
}

function guardRequiring(required: Role[]): RolesGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows a permitted role', () => {
    expect(guardRequiring([Role.OWNER, Role.ADMIN]).canActivate(contextFor(Role.ADMIN))).toBe(true);
  });

  it('rejects ANALYST from a config mutation (403 FORBIDDEN)', () => {
    try {
      guardRequiring([Role.OWNER, Role.ADMIN]).canActivate(contextFor(Role.ANALYST));
      throw new Error('expected rejection');
    } catch (e) {
      expect(isAppError(e) && e.status === 403).toBe(true);
    }
  });

  it('always allows SUPER_ADMIN', () => {
    expect(guardRequiring([Role.OWNER]).canActivate(contextFor(Role.SUPER_ADMIN))).toBe(true);
  });

  it('throws if no tenant role was resolved (TenantGuard skipped)', () => {
    expect(() => guardRequiring([Role.OWNER]).canActivate(contextFor(undefined))).toThrow();
  });
});
