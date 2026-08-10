import { Role, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaService } from '../db/prisma.service';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from './tenant.service';

const auditBodySchema = z.object({ action: z.string().min(1).max(120) });

/**
 * Tenancy API. `memberships` is auth-only (inherently cross-tenant — the switcher);
 * `current` and `current/audit` resolve the active tenant and read/write via the RLS
 * app client, proving end-to-end scoping.
 */
export function tenantRoutes(db: PrismaService, tenants: TenantService): Router {
  const r = Router();

  /** The tenants the caller can switch between (auth only — inherently cross-tenant). */
  r.get(
    '/memberships',
    authMiddleware,
    ah(async (req, res) => {
      res.json({ memberships: await tenants.listMemberships(req.auth!.userId) });
    }),
  );

  /** The active tenant — read via the RLS app client, proving end-to-end scoping. */
  r.get(
    '/current',
    authMiddleware,
    tenantMiddleware(tenants),
    ah(async (req, res) => {
      const tenant = await db.withTenant(req.ctx!.tenantId, (tx) =>
        tx.tenant.findFirstOrThrow({
          where: { id: req.ctx!.tenantId },
          select: { id: true, name: true, type: true, slug: true },
        }),
      );
      res.json({ ...tenant, role: req.ctx!.role });
    }),
  );

  /** A role-gated mutation: ANALYST/AGENT are blocked; config writers may act. */
  r.post(
    '/current/audit',
    authMiddleware,
    tenantMiddleware(tenants),
    requireRoles(Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN),
    ah(async (req, res) => {
      const parsed = auditBodySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('action is required (1–120 chars)');

      const entry = await db.withTenant(req.ctx!.tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            tenantId: req.ctx!.tenantId,
            actorUserId: req.ctx!.userId,
            action: parsed.data.action,
          },
          select: { id: true, action: true, ts: true },
        }),
      );
      res.json(entry);
    }),
  );

  return r;
}
