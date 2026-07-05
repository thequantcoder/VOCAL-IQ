import { Role } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { ScaleService } from './scale.service';

const locQuery = z.object({ lat: z.coerce.number(), lon: z.coerce.number() });

/** Scale/ops status + voice-region routing (Day 62). SUPER_ADMIN for status; routing for members. */
export function scaleRoutes(scale: ScaleService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/status',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (_req, res) => res.json(scale.status())),
  );

  r.get(
    '/voice-region',
    ah(async (req, res) => {
      const parsed = locQuery.safeParse(req.query);
      res.json(scale.resolveVoiceRegion(parsed.success ? parsed.data : null));
    }),
  );

  return r;
}
