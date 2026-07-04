import { Role, ValidationError, markupConfigSchema, subTenantInputSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
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
const overviewQuery = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

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

  // ── Portal dashboards + markup (Day 54) ──
  r.get(
    '/overview',
    ah(async (req, res) => {
      const parsed = overviewQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('A period (YYYY-MM) is required');
      res.json(await reseller.overview(req.ctx!.tenantId, parsed.data.period));
    }),
  );

  r.get(
    '/markup',
    ah(async (req, res) => {
      res.json({ markupBps: await reseller.getMarkupBps(req.ctx!.tenantId) });
    }),
  );
  r.put(
    '/markup',
    ah(async (req, res) => {
      const parsed = markupConfigSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('markupBps (0–100000) is required');
      res.json(await reseller.setMarkupBps(req.ctx!.tenantId, parsed.data.markupBps));
    }),
  );

  return r;
}
