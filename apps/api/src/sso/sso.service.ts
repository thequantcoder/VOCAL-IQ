import { createHash, randomBytes } from 'node:crypto';
import {
  AuthError,
  ForbiddenError,
  MembershipStatus,
  NotFoundError,
  type Role,
  type ScimUser,
  type SsoConfig,
  type SsoConnectionInput,
  ValidationError,
  buildSpMetadata,
  mapScimRole,
  scimEmail,
  scimUserSchema,
  ssoConnectionInputSchema,
} from '@vocaliq/shared';
import { signToken } from '../auth/jwt';
import type { PrismaService } from '../db/prisma.service';
import type { SsoProvider } from './sso-provider';

/**
 * Enterprise SSO/SAML + directory sync (Day 59). Per-tenant IdP config (SAML/OIDC/WorkOS), the
 * SP metadata a tenant hands their IdP, the interactive login → JIT-provisioning flow with role
 * mapping, and SCIM 2.0 directory sync. Coexists with self-hosted email/password auth — a tenant
 * opts in. IdP config is tenant-isolated (RLS + the config row is unique per tenant, self-audit
 * B/C); the SCIM bearer token is stored HASHED only. The live IdP handshake is gated behind the
 * injected SsoProvider (WorkOS swaps in when keys are set).
 */

export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface SsoConnectionDto {
  tenantId: string;
  provider: string;
  enabled: boolean;
  scimEnabled: boolean;
  defaultRole: string;
  roleMappings: Record<string, string>;
  entryPoint: string;
  issuer: string;
}

export class SsoService {
  constructor(
    private readonly db: PrismaService,
    private readonly provider: SsoProvider,
    private readonly baseUrl = process.env.APP_URL ?? 'https://app.vocaliq.dev',
  ) {}

  /** Configure (upsert) the tenant's SSO connection. Owner/admin only; audited. */
  async configure(
    actor: Actor,
    input: unknown,
  ): Promise<{ connection: SsoConnectionDto; scimToken?: string }> {
    const parsed = ssoConnectionInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid SSO config');
    }
    const data: SsoConnectionInput = parsed.data;

    // A new SCIM token is minted (and returned ONCE) when SCIM is enabled and none exists yet.
    let scimToken: string | undefined;
    let scimTokenHash: string | undefined;
    const existing = await this.db.admin.ssoConnection.findUnique({
      where: { tenantId: actor.tenantId },
      select: { scimTokenHash: true },
    });
    if (data.scimEnabled && !existing?.scimTokenHash) {
      scimToken = `scim_${randomBytes(24).toString('hex')}`;
      scimTokenHash = hashToken(scimToken);
    }

    const row = await this.db.admin.ssoConnection.upsert({
      where: { tenantId: actor.tenantId },
      create: {
        tenantId: actor.tenantId,
        provider: data.config.provider,
        config: data.config as object,
        roleMappings: data.roleMappings as object,
        defaultRole: data.defaultRole,
        scimEnabled: data.scimEnabled,
        enabled: data.enabled,
        ...(scimTokenHash ? { scimTokenHash } : {}),
      },
      update: {
        provider: data.config.provider,
        config: data.config as object,
        roleMappings: data.roleMappings as object,
        defaultRole: data.defaultRole,
        scimEnabled: data.scimEnabled,
        enabled: data.enabled,
        ...(scimTokenHash ? { scimTokenHash } : {}),
      },
      select: SELECT,
    });
    await this.audit(actor, 'sso.configure', actor.tenantId, {
      provider: data.config.provider,
      enabled: data.enabled,
    });
    return { connection: toDto(row), ...(scimToken ? { scimToken } : {}) };
  }

  async getConnection(tenantId: string): Promise<SsoConnectionDto | null> {
    const row = await this.db.admin.ssoConnection.findUnique({
      where: { tenantId },
      select: SELECT,
    });
    return row ? toDto(row) : null;
  }

  /** SP SAML metadata for the tenant to register with their IdP. */
  metadata(tenantId: string): string {
    return buildSpMetadata(this.baseUrl, tenantId);
  }

  /** Begin an SSO login: returns the IdP authorization URL to redirect to. */
  async initiateLogin(tenantId: string): Promise<{ url: string }> {
    const conn = await this.loadEnabled(tenantId);
    const url = await this.provider.getAuthorizationUrl({
      tenantId,
      config: conn.config as SsoConfig,
      redirectUri: `${this.baseUrl}/auth/sso/${tenantId}/callback`,
    });
    return { url };
  }

  /**
   * Handle the IdP callback: validate the assertion, JIT-provision the user + membership with the
   * mapped role, and return a VocalIQ session token. New users are created; existing users get
   * their membership upserted (role refreshed from the IdP groups).
   */
  async handleCallback(tenantId: string, code: string): Promise<{ token: string; userId: string }> {
    const conn = await this.loadEnabled(tenantId);
    const profile = await this.provider.validateCallback({
      config: conn.config as SsoConfig,
      code,
    });
    const role = mapScimRole(
      (conn.roleMappings as Record<string, Role>) ?? {},
      profile.groups,
      conn.defaultRole as Role,
    );
    const userId = await this.provisionUser(tenantId, profile.email, profile.name ?? null, role);
    return { token: signToken(userId), userId };
  }

  // ── SCIM 2.0 directory sync ──────────────────────────────────────────────────

  /** Verify a SCIM bearer token against the tenant's connection. Returns the connection or throws. */
  private async authScim(tenantId: string, bearer: string | undefined) {
    const conn = await this.db.admin.ssoConnection.findUnique({
      where: { tenantId },
      select: { scimEnabled: true, scimTokenHash: true, roleMappings: true, defaultRole: true },
    });
    if (!conn || !conn.scimEnabled || !conn.scimTokenHash) {
      throw new NotFoundError('SCIM is not enabled for this tenant');
    }
    const token = (bearer ?? '').replace(/^Bearer\s+/i, '');
    if (!token || hashToken(token) !== conn.scimTokenHash) {
      throw new AuthError('Invalid SCIM token');
    }
    return conn;
  }

  /** SCIM provision/update: create-or-update the user + membership with the mapped role. */
  async scimProvision(
    tenantId: string,
    bearer: string | undefined,
    body: unknown,
  ): Promise<{ email: string; role: string; active: boolean }> {
    const conn = await this.authScim(tenantId, bearer);
    const parsed = scimUserSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Invalid SCIM user');
    const user: ScimUser = parsed.data;
    const email = scimEmail(user);
    if (!email) throw new ValidationError('SCIM user has no email');

    const role = mapScimRole(
      (conn.roleMappings as Record<string, Role>) ?? {},
      user.groups.map((g) => g.display),
      conn.defaultRole as Role,
    );
    if (!user.active) {
      await this.deactivate(tenantId, email);
      return { email, role, active: false };
    }
    await this.provisionUser(tenantId, email, user.displayName ?? null, role);
    return { email, role, active: true };
  }

  /** SCIM deprovision: suspend the membership (soft — preserves audit + data). */
  async scimDeprovision(
    tenantId: string,
    bearer: string | undefined,
    email: string,
  ): Promise<{ ok: true }> {
    await this.authScim(tenantId, bearer);
    await this.deactivate(tenantId, email.toLowerCase());
    return { ok: true };
  }

  // ── internals ────────────────────────────────────────────────────────────────

  /** Create-or-update the user by email + upsert their membership with `role` (JIT). */
  private async provisionUser(
    tenantId: string,
    email: string,
    name: string | null,
    role: Role,
  ): Promise<string> {
    const lower = email.toLowerCase();
    return this.db.admin.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: lower },
        create: { email: lower, name },
        update: name ? { name } : {},
        select: { id: true },
      });
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, role, status: MembershipStatus.ACTIVE },
        update: { role, status: MembershipStatus.ACTIVE },
      });
      return user.id;
    });
  }

  private async deactivate(tenantId: string, email: string): Promise<void> {
    const user = await this.db.admin.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;
    await this.db.admin.membership.updateMany({
      where: { tenantId, userId: user.id },
      data: { status: MembershipStatus.SUSPENDED },
    });
  }

  private async loadEnabled(tenantId: string) {
    const conn = await this.db.admin.ssoConnection.findUnique({ where: { tenantId } });
    if (!conn) throw new NotFoundError('No SSO connection for this tenant');
    if (!conn.enabled) throw new ForbiddenError('SSO is not enabled for this tenant');
    return conn;
  }

  private async audit(
    actor: Actor,
    action: string,
    target: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.db.admin.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action,
        target,
        meta: meta as object,
      },
    });
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toDto(row: {
  tenantId: string;
  provider: string;
  enabled: boolean;
  scimEnabled: boolean;
  defaultRole: string;
  roleMappings: unknown;
  config: unknown;
}): SsoConnectionDto {
  const config = (row.config as { entryPoint?: string; issuer?: string } | null) ?? {};
  return {
    tenantId: row.tenantId,
    provider: row.provider,
    enabled: row.enabled,
    scimEnabled: row.scimEnabled,
    defaultRole: row.defaultRole,
    roleMappings: (row.roleMappings as Record<string, string>) ?? {},
    entryPoint: config.entryPoint ?? '',
    issuer: config.issuer ?? '',
  };
}

const SELECT = {
  tenantId: true,
  provider: true,
  enabled: true,
  scimEnabled: true,
  defaultRole: true,
  roleMappings: true,
  config: true,
} as const;
