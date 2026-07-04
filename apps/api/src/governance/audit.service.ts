import { Role } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Audit log reads (Day 58). A searchable, filterable view of privileged actions. Rows are
 * tamper-proof (a DB trigger blocks UPDATE — self-audit C) and written by the acting services
 * (superadmin, vault, flags, quota). Scope: a SUPER_ADMIN sees the whole platform; a
 * RESELLER_ADMIN sees only its own subtree (RLS via `withTenant`).
 */

export interface AuditFilter {
  action?: string;
  actorUserId?: string;
  tenantId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface AuditRow {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  target: string | null;
  meta: unknown;
  ts: Date;
}

export class AuditService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Search audit rows. A super-admin queries across all tenants (owner client); a reseller-admin
   * is confined to its own subtree via RLS (`withTenant`), so it can never read another reseller's
   * trail (self-audit B).
   */
  async search(actor: { tenantId: string; role: Role }, filter: AuditFilter): Promise<AuditRow[]> {
    const where = {
      ...(filter.action ? { action: { contains: filter.action } } : {}),
      ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
      ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      ...(filter.from || filter.to
        ? {
            ts: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    };
    const take = Math.min(filter.limit ?? 100, 500);
    const args = { where, orderBy: { ts: 'desc' as const }, take, select: SELECT };

    if (actor.role === Role.SUPER_ADMIN) {
      return this.db.admin.auditLog.findMany(args);
    }
    return this.db.withTenant(actor.tenantId, (tx) => tx.auditLog.findMany(args));
  }
}

const SELECT = {
  id: true,
  tenantId: true,
  actorUserId: true,
  action: true,
  target: true,
  meta: true,
  ts: true,
} as const;
