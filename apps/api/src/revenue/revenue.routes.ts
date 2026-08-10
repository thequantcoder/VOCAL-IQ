import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { RevenueService } from './revenue.service';

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * Revenue attribution API (Day 81). Reads (list + dashboard) are any-member; recording revenue is
 * config-writer. Mounted at /revenue. Every call is RLS-scoped by the tenant context.
 */
export function revenueRoutes(revenue: RevenueService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => res.json(await revenue.list(req.ctx!.tenantId))),
  );

  /** ROI dashboard for a window (defaults to the last 30 days). */
  r.get(
    '/dashboard',
    ah(async (req, res) => {
      const q = rangeSchema.parse(req.query);
      const to = q.to ?? new Date();
      const from = q.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      res.json(await revenue.dashboard(req.ctx!.tenantId, { from, to }));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.status(201).json(await revenue.record(req.ctx!.tenantId, req.body))),
  );

  return r;
}
