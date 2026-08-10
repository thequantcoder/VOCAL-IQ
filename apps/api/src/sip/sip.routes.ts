import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { SipService } from './sip.service';

/** BYO-SIP trunk API (Day 35). Reads open to members; mutations to config writers. */
export function sipRoutes(sip: SipService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await sip.list(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await sip.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await sip.create(req.ctx!.tenantId, req.body));
    }),
  );

  r.patch(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await sip.update(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await sip.remove(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
