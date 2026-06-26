import { Role } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';
import { canMutateConfig, hasRequiredRole } from './roles';

describe('role matrix', () => {
  it('SUPER_ADMIN passes any requirement', () => {
    expect(hasRequiredRole(Role.SUPER_ADMIN, [Role.OWNER])).toBe(true);
    expect(hasRequiredRole(Role.SUPER_ADMIN, [])).toBe(true);
  });

  it('a role passes only when explicitly listed', () => {
    expect(hasRequiredRole(Role.ADMIN, [Role.OWNER, Role.ADMIN])).toBe(true);
    expect(hasRequiredRole(Role.ANALYST, [Role.OWNER, Role.ADMIN])).toBe(false);
  });

  it('empty/undefined requirement means any member', () => {
    expect(hasRequiredRole(Role.AGENT, undefined)).toBe(true);
    expect(hasRequiredRole(Role.AGENT, [])).toBe(true);
  });

  it('config writers can mutate; read-only roles cannot', () => {
    expect(canMutateConfig(Role.OWNER)).toBe(true);
    expect(canMutateConfig(Role.ADMIN)).toBe(true);
    expect(canMutateConfig(Role.BUILDER)).toBe(true);
    expect(canMutateConfig(Role.RESELLER_ADMIN)).toBe(true);
    expect(canMutateConfig(Role.ANALYST)).toBe(false);
    expect(canMutateConfig(Role.AGENT)).toBe(false);
    expect(canMutateConfig(Role.BILLING)).toBe(false);
  });
});
