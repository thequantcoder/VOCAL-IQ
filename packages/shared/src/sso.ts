import { z } from 'zod';
import { Role } from './enums.js';

/**
 * Enterprise SSO/SAML + directory sync (Day 59) — pure config validation, role mapping, SCIM
 * parsing, and SP-metadata generation shared across api/web. The live IdP handshake goes through
 * an `SsoProvider` seam in the API (WorkOS when keys are set; a disabled fallback otherwise —
 * gated). Keeping the logic here pure makes SAML/SCIM behaviour unit-testable without a network.
 */

export const SSO_PROVIDERS = ['WORKOS', 'SAML', 'OIDC'] as const;
export type SsoProviderKind = (typeof SSO_PROVIDERS)[number];

/** Per-tenant IdP config. The x509 cert + entryPoint are public SAML metadata (not secrets). */
export const ssoConfigSchema = z.object({
  provider: z.enum(SSO_PROVIDERS),
  /** IdP SSO URL (SAML entryPoint) or OIDC issuer. */
  entryPoint: z.string().url(),
  /** IdP entity id / issuer. */
  issuer: z.string().min(1).max(300),
  /** IdP signing certificate (PEM/base64). Optional for WorkOS-hosted connections. */
  x509cert: z.string().max(8000).optional(),
  /** WorkOS connection id, when the provider brokers the handshake. */
  connectionId: z.string().max(200).optional(),
});
export type SsoConfig = z.infer<typeof ssoConfigSchema>;

/** IdP group → VocalIQ Role. Unmatched groups fall back to the connection's defaultRole. */
export const roleMappingSchema = z.record(z.nativeEnum(Role));
export type RoleMapping = z.infer<typeof roleMappingSchema>;

export const ssoConnectionInputSchema = z.object({
  config: ssoConfigSchema,
  roleMappings: roleMappingSchema.default({}),
  defaultRole: z.nativeEnum(Role).default(Role.AGENT),
  scimEnabled: z.boolean().default(false),
  enabled: z.boolean().default(false),
});
export type SsoConnectionInput = z.infer<typeof ssoConnectionInputSchema>;

/**
 * Map a set of IdP groups to a VocalIQ role. When several groups match, the HIGHEST-privilege
 * role wins (lowest rank index), so a user in both "sales" (AGENT) and "admins" (ADMIN) gets
 * ADMIN. No match → the default role.
 */
const ROLE_RANK: Role[] = [
  Role.SUPER_ADMIN,
  Role.RESELLER_ADMIN,
  Role.OWNER,
  Role.ADMIN,
  Role.BUILDER,
  Role.ANALYST,
  Role.BILLING,
  Role.AGENT,
];

export function mapScimRole(mappings: RoleMapping, groups: string[], defaultRole: Role): Role {
  let best: Role | undefined;
  for (const g of groups) {
    const mapped = mappings[g];
    if (!mapped) continue;
    if (best === undefined || ROLE_RANK.indexOf(mapped) < ROLE_RANK.indexOf(best)) {
      best = mapped;
    }
  }
  return best ?? defaultRole;
}

/** SP (VocalIQ) SAML metadata a tenant hands to their IdP. Pure string builder. */
export function buildSpMetadata(baseUrl: string, tenantId: string): string {
  const entityId = `${baseUrl}/auth/sso/${tenantId}/metadata`;
  const acs = `${baseUrl}/auth/sso/${tenantId}/callback`;
  return [
    '<?xml version="1.0"?>',
    `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">`,
    '  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">',
    `    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acs}" index="0"/>`,
    '  </SPSSODescriptor>',
    '</EntityDescriptor>',
  ].join('\n');
}

/** A normalized identity returned by the provider after a successful SSO login. */
export interface SsoProfile {
  email: string;
  name?: string;
  groups: string[];
  idpUserId: string;
}

/** SCIM 2.0 user (the subset we consume for JIT provisioning). */
export const scimUserSchema = z.object({
  userName: z.string().email().optional(),
  emails: z
    .array(z.object({ value: z.string().email(), primary: z.boolean().optional() }))
    .optional(),
  displayName: z.string().optional(),
  active: z.boolean().default(true),
  groups: z.array(z.object({ display: z.string() })).default([]),
});
export type ScimUser = z.infer<typeof scimUserSchema>;

/** Extract the primary email from a SCIM user (userName or the primary/first email). */
export function scimEmail(user: ScimUser): string | null {
  if (user.userName) return user.userName.toLowerCase();
  const primary = user.emails?.find((e) => e.primary) ?? user.emails?.[0];
  return primary ? primary.value.toLowerCase() : null;
}
