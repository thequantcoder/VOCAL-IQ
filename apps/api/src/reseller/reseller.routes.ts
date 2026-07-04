import { Role, ValidationError, subTenantInputSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { ResellerService } from './reseller.service';

/**
 * Reseller admin API (Day 51). Every route is RESELLER_ADMIN-gated (SUPER_ADMIN passes too) and
 * RLS-scoped to the caller's reseller tenant — so a reseller only ever provisions/manages its
 * own subtree (self-audit B + C).
 */
export function resellerRoutes(reseller: ResellerService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(Role.RESELLER_ADMIN));

  r.get(
    '/sub-tenants',
    ah(async (req, res) => {
      res.json(await reseller.listSubTenants(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/sub-tenants',
    ah(async (req, res) => {
      const parsed = subTenantInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid sub-tenant');
      res.status(201).json(await reseller.createSubTenant(req.ctx!.tenantId, parsed.data));
    }),
  );

  r.get(
    '/sub-tenants/:id',
    ah(async (req, res) => {
      res.json(await reseller.getSubTenant(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/sub-tenants/:id/suspend',
    ah(async (req, res) => {
      res.json(await reseller.setStatus(req.ctx!.tenantId, req.params.id as string, 'SUSPENDED'));
    }),
  );

  r.post(
    '/sub-tenants/:id/reactivate',
    ah(async (req, res) => {
      res.json(await reseller.setStatus(req.ctx!.tenantId, req.params.id as string, 'ACTIVE'));
    }),
  );

  return r;
}
