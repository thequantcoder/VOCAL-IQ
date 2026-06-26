/**
 * Extract a Bearer token from an Authorization header. Pure + decorator-free so it
 * is trivially unit-testable. Returns the raw token or null when absent/malformed.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}
