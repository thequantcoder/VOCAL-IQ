import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { AbuseService } from './abuse.service';

/** Abuse-risk API (Day 64). A tenant admin can see its own live abuse verdict. Mounted at /abuse. */
export function abuseRoutes(abuse: AbuseService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/assess',
    ah(async (req, res) => res.json(await abuse.assess(req.ctx!.tenantId))),
  );

  return r;
}
