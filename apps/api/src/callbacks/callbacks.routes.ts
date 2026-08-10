import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { CallbacksService } from './callbacks.service';

/**
 * Callbacks API (Day 80). Reads are any-member; schedule/cancel are config-writer. Mounted at
 * /callbacks. The in-call flow / inbound IVR path schedules via the service directly.
 */
export function callbacksRoutes(callbacks: CallbacksService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) =>
      res.json(await callbacks.list(req.ctx!.tenantId, req.query.status as string | undefined)),
    ),
  );
  r.get(
    '/:id',
    ah(async (req, res) =>
      res.json(await callbacks.get(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await callbacks.create(req.ctx!.tenantId, req.body)),
    ),
  );
  r.post(
    '/:id/cancel',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await callbacks.cancel(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  return r;
}
