import {
  ForbiddenError,
  NotFoundError,
  type Provider,
  Role,
  ValidationError,
} from '@vocaliq/shared';
import type { EnvelopeEncryptor } from '../crypto/envelope';
import { last4 } from '../crypto/envelope';
import type { PrismaService } from '../db/prisma.service';

/**
 * Provider key vault (Day 57). Stores platform + tenant (BYOK) provider secrets ENVELOPE-encrypted
 * at rest (never plaintext in the DB, a log, or a response — self-audit C, the critical property),
 * with rotation + revocation, and an audit row on every change. Reads return only masked metadata
 * (provider + last-4 hint). Platform keys (tenantId null) are SUPER_ADMIN-only; a tenant manages
 * only its own BYOK keys under RLS.
 */

export type KeyScope = 'platform' | 'tenant';

export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
}

/** Masked view — NEVER includes the secret. */
export interface VaultKeyDto {
  id: string;
  provider: string;
  scope: KeyScope;
  byok: boolean;
  last4: string;
  createdAt: Date;
}

export class VaultService {
  constructor(
    private readonly db: PrismaService,
    private readonly enc: EnvelopeEncryptor,
  ) {}

  /**
   * Store a new provider key. `scope: 'platform'` (tenantId null, managed key) is SUPER_ADMIN-only;
   * `scope: 'tenant'` stores a BYOK key owned by the actor's tenant. The plaintext is sealed
   * immediately and only the ciphertext + a last-4 hint are persisted.
   */
  async addKey(
    actor: Actor,
    input: { provider: Provider; apiKey: string; scope: KeyScope },
  ): Promise<VaultKeyDto> {
    const apiKey = input.apiKey?.trim();
    if (!apiKey || apiKey.length < 8) throw new ValidationError('A valid API key is required');
    const tenantId = this.scopeTenantId(actor, input.scope);
    const byok = input.scope === 'tenant';

    const created = await this.db.admin.providerCredential.create({
      data: {
        tenantId,
        provider: input.provider,
        encryptedKey: this.enc.encrypt(apiKey),
        byok,
        meta: { last4: last4(apiKey) } as object,
      },
      select: SELECT,
    });
    await this.audit(actor, tenantId, 'vault.key.add', created.id, {
      provider: input.provider,
      scope: input.scope,
    });
    return toDto(created);
  }

  /** Masked list. Platform scope → SUPER_ADMIN; tenant scope → the actor's own BYOK keys. */
  async listKeys(actor: Actor, scope: KeyScope): Promise<VaultKeyDto[]> {
    const tenantId = this.scopeTenantId(actor, scope);
    const rows = await this.db.admin.providerCredential.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  /** Rotate a key in place: re-encrypt the new secret, refresh the last-4 hint, audit. */
  async rotate(actor: Actor, id: string, newApiKey: string): Promise<VaultKeyDto> {
    const key = newApiKey?.trim();
    if (!key || key.length < 8) throw new ValidationError('A valid API key is required');
    const existing = await this.load(id);
    this.assertCanManage(actor, existing.tenantId);
    const updated = await this.db.admin.providerCredential.update({
      where: { id },
      data: { encryptedKey: this.enc.encrypt(key), meta: { last4: last4(key) } as object },
      select: SELECT,
    });
    await this.audit(actor, existing.tenantId, 'vault.key.rotate', id, {
      provider: existing.provider,
    });
    return toDto(updated);
  }

  /** Revoke (delete) a key. Audited. */
  async revoke(actor: Actor, id: string): Promise<{ id: string }> {
    const existing = await this.load(id);
    this.assertCanManage(actor, existing.tenantId);
    await this.db.admin.providerCredential.delete({ where: { id } });
    await this.audit(actor, existing.tenantId, 'vault.key.revoke', id, {
      provider: existing.provider,
    });
    return { id };
  }

  private async load(id: string) {
    const row = await this.db.admin.providerCredential.findUnique({
      where: { id },
      select: SELECT,
    });
    if (!row) throw new NotFoundError('Key not found');
    return row;
  }

  /** Resolve + authorize the target tenantId for a scope. */
  private scopeTenantId(actor: Actor, scope: KeyScope): string | null {
    if (scope === 'platform') {
      if (actor.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenError('Only a super-admin can manage platform keys');
      }
      return null;
    }
    return actor.tenantId; // BYOK: always the actor's own tenant
  }

  /** A key is manageable by a super-admin (any) or the tenant that owns it. */
  private assertCanManage(actor: Actor, keyTenantId: string | null): void {
    if (actor.role === Role.SUPER_ADMIN) return;
    if (keyTenantId !== null && keyTenantId === actor.tenantId) return;
    throw new ForbiddenError('You cannot manage this key');
  }

  private async audit(
    actor: Actor,
    tenantId: string | null,
    action: string,
    target: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    // Platform-key changes are audited on the actor's (platform) tenant so there's always a trail.
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

function toDto(row: {
  id: string;
  tenantId: string | null;
  provider: string;
  byok: boolean;
  meta: unknown;
  createdAt: Date;
}): VaultKeyDto {
  const meta = (row.meta as { last4?: string } | null) ?? {};
  return {
    id: row.id,
    provider: row.provider,
    scope: row.tenantId === null ? 'platform' : 'tenant',
    byok: row.byok,
    last4: meta.last4 ?? '••••',
    createdAt: row.createdAt,
  };
}

const SELECT = {
  id: true,
  tenantId: true,
  provider: true,
  byok: true,
  meta: true,
  createdAt: true,
} as const;
