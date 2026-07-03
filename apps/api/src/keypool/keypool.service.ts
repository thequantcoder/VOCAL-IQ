import {
  type KeyPoolEntry,
  NotFoundError,
  type Provider,
  ValidationError,
  isEjected,
  pickPoolKey,
  registerFailure,
  registerSuccess,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';

/**
 * Platform API key-pool management + selection (Day 38, Blueprint §4.5). Managed mode can
 * hold several keys per provider so a single key's rate limit / outage doesn't cap
 * concurrency. This service owns the pool (SUPER_ADMIN only — it is platform-global, not
 * tenant-scoped) and exposes `selectKey`/`recordResult` used by the key-resolver: the pure
 * weighted-LRU + ejection logic lives in `@vocaliq/shared` (key-pool.ts); here we persist
 * the health fields it returns. Keys are sealed to bytes and NEVER returned to a client.
 */

export const addKeySchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(8),
  weight: z.number().int().min(1).max(100).default(1),
  label: z.string().max(80).optional(),
});

export interface KeyPoolDto {
  id: string;
  provider: string;
  label: string | null;
  weight: number;
  active: boolean;
  failureCount: number;
  ejected: boolean;
  lastUsedAt: Date | null;
}

/** A resolved platform key + the id needed to report its call outcome for health tracking. */
export interface SelectedKey {
  id: string;
  apiKey: string;
}

function seal(apiKey: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(apiKey);
  // Prisma Bytes = Uint8Array<ArrayBuffer>. Real envelope encryption lands with KMS (Day 57).
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
}
function open(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** last-4 hint so the operator can identify a key without ever exposing it. */
function last4(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}

interface PoolRow {
  id: string;
  provider: string;
  label: string | null;
  weight: number;
  active: boolean;
  failureCount: number;
  lastFailureAt: Date | null;
  lastUsedAt: Date | null;
}

function toEntry(row: PoolRow): KeyPoolEntry {
  return {
    id: row.id,
    weight: row.weight,
    active: row.active,
    failureCount: row.failureCount,
    lastFailureAt: row.lastFailureAt ? row.lastFailureAt.getTime() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.getTime() : null,
  };
}

export class KeyPoolService {
  constructor(private readonly db: PrismaService) {}

  /** List every key in the pool (masked) with its live ejection state. */
  async list(): Promise<KeyPoolDto[]> {
    const now = Date.now();
    const rows = (await this.db.admin.platformApiKeyPool.findMany({
      select: {
        id: true,
        provider: true,
        label: true,
        weight: true,
        active: true,
        failureCount: true,
        lastFailureAt: true,
        lastUsedAt: true,
      },
      orderBy: [{ provider: 'asc' }, { weight: 'desc' }],
    })) as PoolRow[];
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      label: r.label,
      weight: r.weight,
      active: r.active,
      failureCount: r.failureCount,
      ejected: isEjected(toEntry(r), now),
      lastUsedAt: r.lastUsedAt,
    }));
  }

  async add(input: unknown): Promise<KeyPoolDto> {
    const parsed = addKeySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid key');
    }
    const { provider, apiKey, weight, label } = parsed.data;
    const row = (await this.db.admin.platformApiKeyPool.create({
      data: {
        provider: provider as Provider,
        encryptedKey: seal(apiKey),
        weight,
        label: label ?? last4(apiKey),
      },
      select: {
        id: true,
        provider: true,
        label: true,
        weight: true,
        active: true,
        failureCount: true,
        lastFailureAt: true,
        lastUsedAt: true,
      },
    })) as PoolRow;
    return { ...row, ejected: false };
  }

  async setActive(id: string, active: boolean): Promise<{ id: string; active: boolean }> {
    const existing = await this.db.admin.platformApiKeyPool.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Key not found');
    // Re-activating a key clears its failure state (fresh probe).
    await this.db.admin.platformApiKeyPool.update({
      where: { id },
      data: active ? { active, failureCount: 0, lastFailureAt: null } : { active },
    });
    return { id, active };
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.db.admin.platformApiKeyPool.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Key not found');
    await this.db.admin.platformApiKeyPool.delete({ where: { id } });
    return { id };
  }

  /**
   * Select a platform key for `provider` (weighted-LRU, skipping ejected keys) and stamp
   * its `lastUsedAt`. Returns null when the pool has no healthy key for the provider — the
   * resolver then falls back to the single env key.
   */
  async selectKey(provider: Provider): Promise<SelectedKey | null> {
    const rows = (await this.db.admin.platformApiKeyPool.findMany({
      where: { provider, active: true },
      select: {
        id: true,
        provider: true,
        label: true,
        weight: true,
        active: true,
        failureCount: true,
        lastFailureAt: true,
        lastUsedAt: true,
        encryptedKey: true,
      },
    })) as (PoolRow & { encryptedKey: Uint8Array })[];
    if (rows.length === 0) return null;

    const now = Date.now();
    const chosen = pickPoolKey(rows.map(toEntry), now);
    if (!chosen) return null;

    const row = rows.find((r) => r.id === chosen.id);
    if (!row) return null;
    await this.db.admin.platformApiKeyPool.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date(now) },
    });
    return { id: row.id, apiKey: open(row.encryptedKey) };
  }

  /** Record a call outcome for a pool key so failing keys are ejected + healthy ones reset. */
  async recordResult(id: string, ok: boolean): Promise<void> {
    const row = (await this.db.admin.platformApiKeyPool.findUnique({
      where: { id },
      select: {
        id: true,
        provider: true,
        label: true,
        weight: true,
        active: true,
        failureCount: true,
        lastFailureAt: true,
        lastUsedAt: true,
      },
    })) as PoolRow | null;
    if (!row) return; // key removed mid-flight — nothing to record
    const now = Date.now();
    const patch = ok ? registerSuccess(toEntry(row), now) : registerFailure(toEntry(row), now);
    await this.db.admin.platformApiKeyPool.update({
      where: { id },
      data: {
        ...(patch.failureCount !== undefined ? { failureCount: patch.failureCount } : {}),
        ...(patch.lastFailureAt !== undefined
          ? { lastFailureAt: patch.lastFailureAt === null ? null : new Date(patch.lastFailureAt) }
          : {}),
        ...(patch.lastUsedAt !== undefined && patch.lastUsedAt !== null
          ? { lastUsedAt: new Date(patch.lastUsedAt) }
          : {}),
      },
    });
  }
}
