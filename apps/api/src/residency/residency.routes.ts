import { DATA_REGIONS, Role } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, ResidencyService } from './residency.service';

const ADMINS: Role[] = [Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN];

/** Data-residency API (Day 61). Region catalog is open to members; pinning is admin-only. */
export function residencyRoutes(residency: ResidencyService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));
  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  r.get(
    '/regions',
    ah(async (_req, res) =>
      res.json({ regions: DATA_REGIONS, platform: residency.platformRegion() }),
    ),
  );
  r.get(
    '/',
    ah(async (req, res) => res.json(await residency.resolve(req.ctx!.tenantId))),
  );
  r.put(
    '/',
    requireRoles(...ADMINS),
    ah(async (req, res) => res.json(await residency.setResidency(actorOf(req), req.body))),
  );

  return r;
}
