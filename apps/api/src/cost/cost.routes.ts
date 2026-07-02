import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { CostService } from './cost.service';

const rollupQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  groupBy: z.enum(['day', 'capability', 'provider', 'agent']).default('day'),
});

const rangeQuery = z.object({ from: z.coerce.date(), to: z.coerce.date() });

/** Cost API — per-call breakdown, rollups, and config-writer reconciliation. */
export function costRoutes(cost: CostService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  /** Per-call cost breakdown + usage records. Any tenant member (RLS-scoped read). */
  r.get(
    '/calls/:id/cost',
    ah(async (req, res) => {
      res.json(await cost.callCost(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  /** Cost rolled up over a date range by day / capability / provider / agent. */
  r.get(
    '/costs/rollup',
    ah(async (req, res) => {
      const parsed = rollupQuery.safeParse(req.query);
      if (!parsed.success)
        throw new ValidationError('from + to (dates) required; groupBy optional');
      if (parsed.data.to <= parsed.data.from)
        throw new ValidationError('`to` must be after `from`');
      res.json(await cost.rollup(req.ctx!.tenantId, parsed.data));
    }),
  );

  /** Reconciliation sweep for un-metered COMPLETED calls. Config-writers only. */
  r.post(
    '/costs/reconcile',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = rangeQuery.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('from + to (dates) required');
      res.json(await cost.reconcile(req.ctx!.tenantId, parsed.data));
    }),
  );

  return r;
}
