import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { OutcomeBillingService } from './outcome-billing.service';

const disputeSchema = z.object({ note: z.string().max(200).optional() });

/**
 * Outcome-based billing API (Day 82). Reads (prices + outcomes) are any-member; setting prices,
 * recording a billable outcome, and disputing are config-writer (they move money). Mounted at
 * /outcomes. Every call is RLS-scoped by the tenant context.
 */
export function outcomeBillingRoutes(
  outcomes: OutcomeBillingService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/prices',
    ah(async (req, res) => res.json(await outcomes.prices(req.ctx!.tenantId))),
  );
  r.put(
    '/prices',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await outcomes.setPrice(req.ctx!.tenantId, req.body))),
  );

  r.get(
    '/',
    ah(async (req, res) =>
      res.json(await outcomes.list(req.ctx!.tenantId, req.query.status as string | undefined)),
    ),
  );
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await outcomes.recordOutcome(req.ctx!.tenantId, req.body)),
    ),
  );
  r.post(
    '/:id/dispute',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = disputeSchema.safeParse(req.body ?? {});
      res.json(await outcomes.dispute(req.ctx!.tenantId, req.params.id as string, p.data?.note));
    }),
  );

  return r;
}
