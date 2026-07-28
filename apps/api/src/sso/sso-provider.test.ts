import type { SsoConfig } from '@vocaliq/shared';
import { isAppError } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { DisabledSsoProvider, WorkOsSsoProvider, buildSsoProvider } from './sso-provider';

/**
 * Offline unit proof of the live WorkOS provider: a stubbed `fetch` records the token request +
 * returns a canned profile, so we assert the authorize URL, the `/sso/token` exchange, the
 * normalized `SsoProfile`, and the safe-error behaviour — no network, no key.
 */

const config: SsoConfig = {
  provider: 'WORKOS',
  entryPoint: 'https://idp.example.com/sso',
  issuer: 'urn:acme',
  connectionId: 'conn_123',
};

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe('WorkOsSsoProvider.getAuthorizationUrl', () => {
  it('builds the /sso/authorize redirect keyed on the connection, with tenantId as state', async () => {
    const url = new URL(
      await new WorkOsSsoProvider('sk_test', 'client_abc').getAuthorizationUrl({
        tenantId: 't1',
        config,
        redirectUri: 'https://app.vocaliq/cb',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://api.workos.com/sso/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client_abc');
    expect(url.searchParams.get('connection')).toBe('conn_123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.vocaliq/cb');
    expect(url.searchParams.get('state')).toBe('t1');
  });
});

describe('WorkOsSsoProvider.validateCallback', () => {
  it('exchanges the code and normalizes the profile (name from first/last, idp_id → idpUserId)', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        profile: {
          id: 'prof_1',
          idp_id: 'idp_9',
          email: 'jane@acme.com',
          first_name: 'Jane',
          last_name: 'Doe',
          groups: ['admins'],
        },
      }),
    ) as unknown as typeof fetch;
    const profile = await new WorkOsSsoProvider(
      'sk_test',
      'client_abc',
      fetchImpl,
    ).validateCallback({
      config,
      code: 'auth_code',
    });
    expect(profile).toEqual({
      email: 'jane@acme.com',
      name: 'Jane Doe',
      groups: ['admins'],
      idpUserId: 'idp_9',
    });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      method: string;
      body: string;
    };
    expect(init.method).toBe('POST');
    const form = new URLSearchParams(init.body);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('client_secret')).toBe('sk_test');
    expect(form.get('code')).toBe('auth_code');
  });

  it('raises a safe AuthError on a non-2xx exchange', async () => {
    const bad = (async () =>
      ({ ok: false, status: 401, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(
      new WorkOsSsoProvider('sk', 'cid', bad).validateCallback({ config, code: 'x' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'AUTH');
  });

  it('raises when the profile has no email', async () => {
    const noEmail = (async () => ok({ profile: { id: 'p' } })) as unknown as typeof fetch;
    await expect(
      new WorkOsSsoProvider('sk', 'cid', noEmail).validateCallback({ config, code: 'x' }),
    ).rejects.toSatisfy((e) => isAppError(e));
  });
});

describe('buildSsoProvider', () => {
  it('returns the live WorkOS provider only when BOTH WORKOS_API_KEY + WORKOS_CLIENT_ID are set', () => {
    expect(
      buildSsoProvider({ WORKOS_API_KEY: 'sk', WORKOS_CLIENT_ID: 'cid' } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(WorkOsSsoProvider);
    expect(buildSsoProvider({ WORKOS_API_KEY: 'sk' } as NodeJS.ProcessEnv)).toBeInstanceOf(
      DisabledSsoProvider,
    );
    expect(buildSsoProvider({} as NodeJS.ProcessEnv)).toBeInstanceOf(DisabledSsoProvider);
  });
});
