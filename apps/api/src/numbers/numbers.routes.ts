import { ValidationError, numberBuySchema, numberSearchSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { NumbersService } from './numbers.service';

/**
 * Phone-number provisioning API. Reads (list/search) open to members; buy/release restricted to config
 * writers. All tenant-scoped (RLS). Search + buy fall back to a mock catalogue when no carrier keys.
 */
export function numbersRoutes(numbers: NumbersService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // The tenant's owned numbers.
  r.get(
    '/',
    ah(async (req, res) => {
      res.json({ live: numbers.live, items: await numbers.listOwned(req.ctx!.tenantId) });
    }),
  );

  // Search the carrier (or mock) for numbers to buy.
  r.get(
    '/search',
    ah(async (req, res) => {
      const parsed = numberSearchSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid search');
      }
      res.json({ live: numbers.live, items: await numbers.search(req.ctx!.tenantId, parsed.data) });
    }),
  );

  // Buy a number into the tenant's pool.
  r.post(
    '/buy',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = numberBuySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid number');
      }
      res.json(await numbers.buy(req.ctx!.tenantId, parsed.data));
    }),
  );

  // Release a number back to the carrier.
  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await numbers.release(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
