import { ForbiddenError, NotFoundError, Role, ValidationError } from '@vocaliq/shared';
import { type EnvelopeEncryptor, last4 } from '../crypto/envelope';
import type { PrismaService } from '../db/prisma.service';
import type { Actor, KeyScope } from '../vault/vault.service';
import { type MessagingProviderSpec, messagingProviderSpec } from './provider-specs';

/**
 * Per-tenant BYOK vault for messaging providers (GME-01). Mirrors the LLM/telephony `VaultService`
 * but stores a provider's FULL credential SET (multi-field, e.g. Twilio sid+token+from) as ONE
 * envelope-encrypted JSON blob, keyed by the registry provider id (a string — messaging providers
 * aren't in the Postgres `Provider` enum, and there are ~15 of them).
 *
 * The plaintext is sealed immediately; only ciphertext + masked last-4 hints are persisted, so a
 * secret never touches the DB, a log, or an API response (self-audit C). Resolution is BYOK-first:
 * a tenant's own row → a platform-managed row (tenantId null) → the platform env fallback. The `mode`
 * returned drives billing (GME-04): BYOK = thin platform fee, managed = marked-up minutes.
 */

export type MessagingCredMode = 'byok' | 'managed';

export interface ResolvedMessagingCreds {
  providerId: string;
  creds: Record<string, string>;
  mode: MessagingCredMode;
}

/** Masked view — NEVER includes a secret value (secret fields show only a last-4 hint). */
export interface MessagingCredentialDto {
  id: string;
  providerId: string;
  scope: KeyScope;
  fields: Record<string, string>;
  active: boolean;
  createdAt: Date;
}

export class MessagingKeyVault {
  constructor(
    private readonly db: PrismaService,
    private readonly enc: EnvelopeEncryptor,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /**
   * Store (or replace) a provider's credential set. `scope: 'platform'` (tenantId null, managed) is
   * SUPER_ADMIN-only; `scope: 'tenant'` stores a BYOK set owned by the actor's tenant. All required
   * fields (per the provider spec) must be present.
   */
  async setCredential(
    actor: Actor,
    input: { providerId: string; creds: Record<string, string>; scope: KeyScope },
  ): Promise<MessagingCredentialDto> {
    const spec = messagingProviderSpec(input.providerId);
    if (!spec) throw new ValidationError(`Unknown messaging provider: ${input.providerId}`);

    const creds: Record<string, string> = {};
    for (const f of spec.fields) {
      const v = (input.creds?.[f.key] ?? '').trim();
      if (!v) throw new ValidationError(`Missing credential field: ${f.label}`);
      creds[f.key] = v;
    }

    const tenantId = this.scopeTenantId(actor, input.scope);
    const encryptedCreds = this.enc.encrypt(JSON.stringify(creds));
    const meta = { fields: this.maskFields(spec, creds) } as object;

    // App-layer one-per-(scope,provider): find-then-update/create (a null tenantId can't be a
    // Prisma compound-unique lookup; a NULLS-NOT-DISTINCT DB index backs it up — see the migration).
    const existing = await this.db.admin.messagingCredential.findFirst({
      where: { tenantId, providerId: spec.id },
      select: { id: true },
    });
    const row = existing
      ? await this.db.admin.messagingCredential.update({
          where: { id: existing.id },
          data: { encryptedCreds, meta, active: true },
          select: SELECT,
        })
      : await this.db.admin.messagingCredential.create({
          data: { tenantId, providerId: spec.id, encryptedCreds, meta, active: true },
          select: SELECT,
        });

    await this.audit(actor, tenantId, 'messaging.cred.set', row.id, {
      providerId: spec.id,
      scope: input.scope,
    });
    return toDto(row);
  }

  /** Masked list. Platform scope → SUPER_ADMIN; tenant scope → the actor's own BYOK sets. */
  async listCredentials(actor: Actor, scope: KeyScope): Promise<MessagingCredentialDto[]> {
    const tenantId = this.scopeTenantId(actor, scope);
    const rows = await this.db.admin.messagingCredential.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  /** Delete a stored credential set. Audited. */
  async deleteCredential(actor: Actor, id: string): Promise<{ id: string }> {
    const existing = await this.load(id);
    this.assertCanManage(actor, existing.tenantId);
    await this.db.admin.messagingCredential.delete({ where: { id } });
    await this.audit(actor, existing.tenantId, 'messaging.cred.delete', id, {
      providerId: existing.providerId,
    });
    return { id };
  }

  /**
   * Resolve credentials for a send (called per message by the send worker, GME-02): tenant BYOK →
   * platform-managed row → platform env fallback. Returns null if nothing is configured (the send
   * stays gated/QUEUED). Decryption is in-memory only; the result is never logged.
   */
  async resolve(tenantId: string, providerId: string): Promise<ResolvedMessagingCreds | null> {
    const spec = messagingProviderSpec(providerId);
    if (!spec) return null;

    const byok = await this.db.admin.messagingCredential.findFirst({
      where: { tenantId, providerId, active: true },
      select: { encryptedCreds: true },
    });
    if (byok) return { providerId, creds: this.decode(byok.encryptedCreds), mode: 'byok' };

    const managed = await this.db.admin.messagingCredential.findFirst({
      where: { tenantId: null, providerId, active: true },
      select: { encryptedCreds: true },
    });
    if (managed) return { providerId, creds: this.decode(managed.encryptedCreds), mode: 'managed' };

    const envCreds = this.fromEnv(spec);
    if (envCreds) return { providerId, creds: envCreds, mode: 'managed' };
    return null;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private decode(blob: Uint8Array): Record<string, string> {
    return JSON.parse(this.enc.decrypt(blob)) as Record<string, string>;
  }

  /** Platform env fallback — all-or-nothing (a provider needs its full credential set). */
  private fromEnv(spec: MessagingProviderSpec): Record<string, string> | null {
    const creds: Record<string, string> = {};
    for (const [field, envVar] of Object.entries(spec.env)) {
      const v = this.env[envVar];
      if (!v) return null;
      creds[field] = v;
    }
    return Object.keys(creds).length > 0 ? creds : null;
  }

  private maskFields(
    spec: MessagingProviderSpec,
    creds: Record<string, string>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of spec.fields)
      out[f.key] = f.secret ? last4(creds[f.key] ?? '') : (creds[f.key] ?? '');
    return out;
  }

  private async load(id: string) {
    const row = await this.db.admin.messagingCredential.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundError('Messaging credential not found');
    return row;
  }

  private scopeTenantId(actor: Actor, scope: KeyScope): string | null {
    if (scope === 'platform') {
      if (actor.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenError('Only a super-admin can manage platform messaging credentials');
      }
      return null;
    }
    return actor.tenantId; // BYOK: always the actor's own tenant
  }

  private assertCanManage(actor: Actor, credTenantId: string | null): void {
    if (actor.role === Role.SUPER_ADMIN) return;
    if (credTenantId !== null && credTenantId === actor.tenantId) return;
    throw new ForbiddenError('You cannot manage this credential');
  }

  private async audit(
    actor: Actor,
    tenantId: string | null,
    action: string,
    target: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.db.admin.auditLog.create({
      data: {
        tenantId: tenantId ?? actor.tenantId,
        actorUserId: actor.userId,
        action,
        target,
        meta: meta as object,
      },
    });
  }
}

const SELECT = {
  id: true,
  tenantId: true,
  providerId: true,
  meta: true,
  active: true,
  createdAt: true,
} as const;

function toDto(row: {
  id: string;
  tenantId: string | null;
  providerId: string;
  meta: unknown;
  active: boolean;
  createdAt: Date;
}): MessagingCredentialDto {
  const meta = (row.meta as { fields?: Record<string, string> } | null) ?? {};
  return {
    id: row.id,
    providerId: row.providerId,
    scope: row.tenantId === null ? 'platform' : 'tenant',
    fields: meta.fields ?? {},
    active: row.active,
    createdAt: row.createdAt,
  };
}
