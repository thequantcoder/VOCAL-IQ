import { Role, ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor } from '../vault/vault.service';
import type { DltService } from './dlt.service';

/** Roles that manage compliance/config. SUPER_ADMIN always passes. */
const DLT_MANAGERS: Role[] = [Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN];

const registerBody = z.object({
  entityId: z.string().min(1),
  senderId: z.string().min(1),
  dltTemplateId: z.string().min(1),
  category: z.enum(['transactional', 'service', 'promotional']).default('transactional'),
  body: z.string().min(1).max(2000),
});

/**
 * India DLT template registry API (GME-06). A tenant registers its DLT-approved templates here; the
 * send path blocks any +91 SMS whose body doesn't match one. Gated to config-manager roles; RLS +
 * app-layer tenant scoping. Mounted at /messaging/dlt.
 */
export function dltRoutes(dlt: DltService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...DLT_MANAGERS));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await dlt.list(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/',
    ah(async (req, res) => {
      const p = registerBody.safeParse(req.body);
      if (!p.success)
        throw new ValidationError(p.error.issues[0]?.message ?? 'Invalid DLT template');
      res.status(201).json(await dlt.register(actorOf(req), p.data));
    }),
  );

  r.delete(
    '/:id',
    ah(async (req, res) => {
      res.json(await dlt.delete(actorOf(req), req.params.id as string));
    }),
  );

  return r;
}
