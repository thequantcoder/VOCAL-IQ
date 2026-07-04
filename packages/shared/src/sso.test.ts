import { describe, expect, it } from 'vitest';
import { Role } from './enums.js';
import {
  buildSpMetadata,
  mapScimRole,
  scimEmail,
  scimUserSchema,
  ssoConnectionInputSchema,
} from './sso.js';

describe('ssoConnectionInputSchema', () => {
  it('validates a SAML config and defaults role/flags', () => {
    const c = ssoConnectionInputSchema.parse({
      config: {
        provider: 'SAML',
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'urn:example:idp',
      },
    });
    expect(c.defaultRole).toBe(Role.AGENT);
    expect(c.enabled).toBe(false);
  });
  it('rejects a non-URL entryPoint', () => {
    expect(() =>
      ssoConnectionInputSchema.parse({
        config: { provider: 'SAML', entryPoint: 'nope', issuer: 'x' },
      }),
    ).toThrow();
  });
});

describe('mapScimRole (highest privilege wins)', () => {
  const mappings = { sales: Role.AGENT, admins: Role.ADMIN, finance: Role.BILLING };
  it('maps a single group', () => {
    expect(mapScimRole(mappings, ['sales'], Role.AGENT)).toBe(Role.AGENT);
  });
  it('picks the highest-privilege role across groups', () => {
    expect(mapScimRole(mappings, ['sales', 'admins'], Role.AGENT)).toBe(Role.ADMIN);
  });
  it('falls back to the default when no group matches', () => {
    expect(mapScimRole(mappings, ['unknown'], Role.ANALYST)).toBe(Role.ANALYST);
  });
});

describe('buildSpMetadata', () => {
  it('embeds the tenant-scoped ACS + entityID', () => {
    const xml = buildSpMetadata('https://app.vocaliq.dev', 'tenant-123');
    expect(xml).toContain('/auth/sso/tenant-123/callback');
    expect(xml).toContain('/auth/sso/tenant-123/metadata');
    expect(xml).toContain('SPSSODescriptor');
  });
});

describe('scimEmail', () => {
  it('prefers userName, else the primary email, lower-cased', () => {
    expect(scimEmail(scimUserSchema.parse({ userName: 'Alice@Example.com' }))).toBe(
      'alice@example.com',
    );
    expect(
      scimEmail(
        scimUserSchema.parse({
          emails: [{ value: 'b@x.com' }, { value: 'c@x.com', primary: true }],
        }),
      ),
    ).toBe('c@x.com');
    expect(scimEmail(scimUserSchema.parse({}))).toBeNull();
  });
});
