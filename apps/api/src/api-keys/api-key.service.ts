import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NotFoundError, ValidationError } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Public API keys (Day 48). Keys are shown to the operator ONCE at creation; only their
 * sha256 hash is stored (like a password). `authenticate` resolves a raw key to its tenant +
 * scopes (constant-time compare, revocation-checked) and is the entry point for the public-API
 * middleware — it also meters usage (requestCount + lastUsedAt). CRUD is RLS-scoped; the
 * authenticate path uses the owner client because an inbound key has no tenant context yet
 * (self-audit C).
 */

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  requestCount: number;
  lastUsedAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}

export interface CreatedApiKey extends ApiKeyRow {
  /** The full plaintext key — returned ONCE, never stored or shown again. */
  key: string;
}

export interface AuthenticatedKey {
  keyId: string;
  tenantId: string;
  scopes: string[];
  rateLimitPerMin: number;
}

const hashKey = (raw: string) => createHash('sha256').update(raw).digest('hex');

export class ApiKeyService {
  constructor(private readonly db: PrismaService) {}

  async create(
    tenantId: string,
    input: { name: string; scopes: string[]; rateLimitPerMin?: number },
  ): Promise<CreatedApiKey> {
    if (!input.name?.trim()) throw new ValidationError('API key name is required');
    const secret = randomBytes(24).toString('hex'); // 48 hex chars
    const key = `vq_live_${secret}`;
    const prefix = `vq_live_${secret.slice(0, 8)}`;
    const rateLimitPerMin = Math.min(Math.max(input.rateLimitPerMin ?? 60, 1), 6000);

    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.apiKey.create({
        data: {
          tenantId,
          name: input.name.trim(),
          prefix,
          hashedKey: hashKey(key),
          scopes: input.scopes,
          rateLimitPerMin,
        },
        select: SELECT,
      }),
    );
    return { ...toRow(row), key };
  }

  async list(tenantId: string): Promise<ApiKeyRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.apiKey.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT }),
    );
    return rows.map(toRow);
  }

  async revoke(tenantId: string, id: string): Promise<ApiKeyRow> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.apiKey.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('API key not found');
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.apiKey.update({ where: { id }, data: { revoked: true }, select: SELECT }),
    );
    return toRow(row);
  }

  /**
   * Resolve a raw key to its tenant + scopes, or null if unknown/revoked. Constant-time hash
   * compare. Uses the owner client (no tenant context on an inbound API request yet).
   */
  async authenticate(rawKey: string | undefined): Promise<AuthenticatedKey | null> {
    if (!rawKey || !rawKey.startsWith('vq_live_')) return null;
    const hashed = hashKey(rawKey);
    const row = await this.db.admin.apiKey.findUnique({
      where: { hashedKey: hashed },
      select: {
        id: true,
        tenantId: true,
        scopes: true,
        rateLimitPerMin: true,
        revoked: true,
        hashedKey: true,
      },
    });
    if (!row || row.revoked) return null;
    // Redundant constant-time check (the unique lookup already matched the full hash).
    const a = Buffer.from(row.hashedKey);
    const b = Buffer.from(hashed);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return {
      keyId: row.id,
      tenantId: row.tenantId,
      scopes: row.scopes,
      rateLimitPerMin: row.rateLimitPerMin,
    };
  }

  /** Meter one request against a key (fire-and-forget from the middleware). */
  async meter(keyId: string): Promise<void> {
    await this.db.admin.apiKey.update({
      where: { id: keyId },
      data: { requestCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }
}

const SELECT = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  rateLimitPerMin: true,
  requestCount: true,
  lastUsedAt: true,
  revoked: true,
  createdAt: true,
} as const;

function toRow(r: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  requestCount: number;
  lastUsedAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}): ApiKeyRow {
  return r;
}
