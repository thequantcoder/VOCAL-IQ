import { Role, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MarketplaceService } from './marketplace.service';

const reviewSchema = z.object({ action: z.enum(['approve', 'reject']) });
const submitSchema = z.object({ status: z.enum(['pending', 'draft', 'delisted']) });

/**
 * Marketplace API (Day 83). Browse (approved listings) is any-member; publish/submit/purchase/rate are
 * config-writer (they move money or content). Review is SUPER_ADMIN (platform moderation). Mounted at
 * /marketplace.
 */
export function marketplaceRoutes(mkt: MarketplaceService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/browse',
    ah(async (_req, res) => res.json(await mkt.browse())),
  );
  r.get(
    '/mine',
    ah(async (req, res) => res.json(await mkt.myListings(req.ctx!.tenantId))),
  );
  r.get(
    '/purchases',
    ah(async (req, res) => res.json(await mkt.myPurchases(req.ctx!.tenantId))),
  );
  r.get(
    '/payouts',
    ah(async (req, res) => res.json(await mkt.payouts(req.ctx!.tenantId))),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.status(201).json(await mkt.publish(req.ctx!.tenantId, req.body))),
  );
  r.post(
    '/:id/submit',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = submitSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('status must be pending | draft | delisted');
      res.json(await mkt.setStatus(req.ctx!.tenantId, req.params.id as string, p.data.status));
    }),
  );
  r.post(
    '/:id/purchase',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await mkt.purchase(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.post(
    '/:id/rate',
    ah(async (req, res) =>
      res.json(await mkt.rate(req.ctx!.tenantId, req.params.id as string, req.body)),
    ),
  );

  // ── platform review (SUPER_ADMIN) ────────────────────────────────────────────
  r.get(
    '/pending',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (_req, res) => res.json(await mkt.pendingReview())),
  );
  r.post(
    '/:id/review',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (req, res) => {
      const p = reviewSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('action must be approve | reject');
      res.json(await mkt.review(req.params.id as string, p.data.action));
    }),
  );

  return r;
}
