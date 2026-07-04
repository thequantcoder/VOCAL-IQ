import { AuthError, type SsoConfig, type SsoProfile } from '@vocaliq/shared';

/**
 * SSO provider seam (Day 59) — the live IdP handshake behind an interface (golden rule #2). The
 * business logic (config, JIT provisioning, role mapping, SCIM) is built + tested against this;
 * the live WorkOS implementation swaps in once WORKOS_* keys are set (memory: gated external
 * deps), with no change to SsoService. A tenant's callback yields a normalized `SsoProfile`.
 */
export interface SsoProvider {
  readonly name: string;
  /** The URL to redirect the user to for the IdP login. */
  getAuthorizationUrl(args: {
    tenantId: string;
    config: SsoConfig;
    redirectUri: string;
  }): Promise<string>;
  /** Exchange the IdP callback code/assertion for a normalized profile. */
  validateCallback(args: { config: SsoConfig; code: string }): Promise<SsoProfile>;
}

/**
 * Default until WorkOS is configured: refuses live SSO with a clear, safe error so the app runs +
 * the SSO logic ships + tests now (via an injected mock provider). Config + metadata + SCIM still
 * work; only the interactive IdP redirect/callback is gated.
 */
export class DisabledSsoProvider implements SsoProvider {
  readonly name = 'disabled';
  async getAuthorizationUrl(): Promise<string> {
    throw new AuthError('SSO is not configured. Set WORKOS_API_KEY to enable enterprise login.');
  }
  async validateCallback(): Promise<SsoProfile> {
    throw new AuthError('SSO is not configured.');
  }
}

/** Select the provider from env. WorkOS is the live swap (gated); disabled otherwise. */
export function buildSsoProvider(env: NodeJS.ProcessEnv = process.env): SsoProvider {
  // A real WorkOsSsoProvider lands here when WORKOS_API_KEY is set; until then, disabled.
  if (env.WORKOS_API_KEY) {
    // Placeholder for the live implementation (kept gated — no key in dev/CI).
    return new DisabledSsoProvider();
  }
  return new DisabledSsoProvider();
}
