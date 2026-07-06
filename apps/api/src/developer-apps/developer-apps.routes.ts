import { Role, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { DeveloperAppsService } from './developer-apps.service';

const submitSchema = z.object({ status: z.enum(['pending', 'draft']) });
const reviewSchema = z.object({ action: z.enum(['approve', 'reject', 'suspend']) });
const installSchema = z.object({ grantScopes: z.array(z.string()).max(20).optional() });

/**
 * Developer app / integration marketplace API (Day 84). Browse (approved apps), my apps + my installs
 * are any-member reads. Register/submit/rotate-secret/install/uninstall are config-writer (they move
 * money or mint credentials). Review is SUPER_ADMIN (platform moderation). Mounted at /apps.
 */
export function developerAppsRoutes(apps: DeveloperAppsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // ── reads (any member) ────────────────────────────────────────────────────────
  r.get(
    '/browse',
    ah(async (_req, res) => res.json(await apps.browse())),
  );
  r.get(
    '/mine',
    ah(async (req, res) => res.json(await apps.myApps(req.ctx!.tenantId))),
  );
  r.get(
    '/installs',
    ah(async (req, res) => res.json(await apps.myInstalls(req.ctx!.tenantId))),
  );

  // ── developer actions (config-writer) ─────────────────────────────────────────
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.status(201).json(await apps.register(req.ctx!.tenantId, req.body))),
  );
  r.post(
    '/:id/rotate-secret',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await apps.rotateSecret(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.post(
    '/:id/submit',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = submitSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('status must be pending | draft');
      res.json(await apps.setStatus(req.ctx!.tenantId, req.params.id as string, p.data.status));
    }),
  );

  // ── install / uninstall (config-writer — mints/revokes a scoped key) ───────────
  r.post(
    '/:id/install',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = installSchema.safeParse(req.body ?? {});
      if (!p.success) throw new ValidationError('grantScopes must be an array of scope strings');
      res
        .status(201)
        .json(await apps.install(req.ctx!.tenantId, req.params.id as string, p.data.grantScopes));
    }),
  );
  r.post(
    '/:id/uninstall',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await apps.uninstall(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  // ── platform review (SUPER_ADMIN) ─────────────────────────────────────────────
  r.get(
    '/pending',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (_req, res) => res.json(await apps.pendingReview())),
  );
  r.post(
    '/:id/review',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (req, res) => {
      const p = reviewSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('action must be approve | reject | suspend');
      res.json(await apps.review(req.params.id as string, p.data.action));
    }),
  );

  return r;
}
