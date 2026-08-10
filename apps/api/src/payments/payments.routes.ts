import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { PaymentsService } from './payments.service';

/**
 * Payments API (Day 78 — PCI-safe pay-by-voice). Reads are any-member; charge/refund are
 * config-writer (they move money). Mounted at /payments. No endpoint ever accepts or returns a card
 * number — the card is captured by the PCI provider out of band.
 */
export function paymentsRoutes(payments: PaymentsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => res.json(await payments.list(req.ctx!.tenantId))),
  );
  r.get(
    '/:id',
    ah(async (req, res) =>
      res.json(await payments.get(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await payments.charge(req.ctx!.tenantId, req.body)),
    ),
  );
  r.post(
    '/:id/refund',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await payments.refund(req.ctx!.tenantId, req.params.id as string, req.body)),
    ),
  );

  return r;
}
