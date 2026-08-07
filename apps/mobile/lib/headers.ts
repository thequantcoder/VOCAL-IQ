/**
 * Pure request-header assembly for the mobile API client. It applies the SAME
 * self-hosted JWT + `x-tenant-id` contract the web app uses, so tenant scoping +
 * RBAC are identical on mobile (self-audit B/C — a request is only ever scoped to
 * the caller's tenant). Deliberately free of expo / react-native imports so it is
 * unit-testable in a plain Node env, with no device-secure-store mocks.
 *
 * Precedence: JSON content-type is the default, auth + tenant are added when known,
 * and caller-supplied headers win last (so a call can override content-type).
 */
export function buildHeaders(
  token: string | null,
  tenant: string | null,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'x-tenant-id': tenant } : {}),
    ...(extra ?? {}),
  };
}
