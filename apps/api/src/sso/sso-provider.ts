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

/** WorkOS `/sso/token` profile (the subset we normalize). All fields optional — we defend on read. */
interface WorkOsProfile {
  id?: string;
  idp_id?: string;
  email?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  groups?: string[];
}

/**
 * Live WorkOS SSO provider (OAuth-2.0-shaped). `getAuthorizationUrl` builds the hosted `/sso/authorize`
 * redirect (keyed on the tenant's `connectionId`; `state` carries the tenantId so the callback routes
 * back to the right connection). `validateCallback` exchanges the code at `/sso/token` and normalizes
 * the returned profile to an `SsoProfile`. The API key (client secret) is never logged; `fetch` is
 * injectable for offline tests (mirrors the other live provider seams).
 */
export class WorkOsSsoProvider implements SsoProvider {
  readonly name = 'workos';
  private readonly base = 'https://api.workos.com';

  constructor(
    private readonly apiKey: string,
    private readonly clientId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getAuthorizationUrl(args: {
    tenantId: string;
    config: SsoConfig;
    redirectUri: string;
  }): Promise<string> {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: args.redirectUri,
      state: args.tenantId,
    });
    if (args.config.connectionId) params.set('connection', args.config.connectionId);
    return `${this.base}/sso/authorize?${params.toString()}`;
  }

  async validateCallback(args: { config: SsoConfig; code: string }): Promise<SsoProfile> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/sso/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.apiKey,
          grant_type: 'authorization_code',
          code: args.code,
        }).toString(),
      });
    } catch {
      throw new AuthError('SSO provider is unreachable. Please try again.');
    }
    if (!res.ok) {
      throw new AuthError(`SSO login failed (provider returned ${res.status}).`);
    }
    const data = (await res.json().catch(() => ({}))) as { profile?: WorkOsProfile };
    const p = data.profile;
    if (!p?.email) {
      throw new AuthError('SSO login did not return a verified email.');
    }
    const name = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return {
      email: p.email,
      ...(name ? { name } : {}),
      groups: p.groups ?? [],
      idpUserId: p.idp_id ?? p.id ?? p.email,
    };
  }
}

/**
 * Select the provider from env. The live WorkOS provider swaps in when BOTH `WORKOS_API_KEY` (client
 * secret) and `WORKOS_CLIENT_ID` are set; disabled otherwise (so dev/CI runs the SSO logic via a mock).
 */
export function buildSsoProvider(env: NodeJS.ProcessEnv = process.env): SsoProvider {
  if (env.WORKOS_API_KEY && env.WORKOS_CLIENT_ID) {
    return new WorkOsSsoProvider(env.WORKOS_API_KEY, env.WORKOS_CLIENT_ID);
  }
  return new DisabledSsoProvider();
}
