import { Role } from '@vocaliq/shared';

/** Roles permitted to mutate tenant configuration (agents, flows, numbers, settings). */
export const CONFIG_WRITERS: readonly Role[] = [
  Role.OWNER,
  Role.ADMIN,
  Role.BUILDER,
  Role.RESELLER_ADMIN,
];

/**
 * Does `role` satisfy the `required` set? SUPER_ADMIN is a platform operator and
 * always passes; otherwise the role must be explicitly listed. An empty/undefined
 * requirement means "any authenticated member of the tenant".
 */
export function hasRequiredRole(role: Role, required: readonly Role[] | undefined): boolean {
  if (role === Role.SUPER_ADMIN) return true;
  if (!required || required.length === 0) return true;
  return required.includes(role);
}

/** Read-only roles that must never mutate configuration. */
export function canMutateConfig(role: Role): boolean {
  return hasRequiredRole(role, CONFIG_WRITERS);
}
