import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import { SquadsService } from './squads.service';

/**
 * Squads API (Day 27). Reads are open to any tenant member; mutations are limited to
 * config writers. Every call is RLS-scoped by the tenant context.
 */
export function squadsRoutes(squads: SquadsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await squads.list(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await squads.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await squads.create(req.ctx!.tenantId, req.body));
    }),
  );

  r.put(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await squads.update(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await squads.remove(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
