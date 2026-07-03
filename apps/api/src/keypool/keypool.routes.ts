import { ValidationError } from '@vocaliq/shared';
import { Role } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { KeyPoolService } from './keypool.service';

const activeSchema = z.object({ active: z.boolean() });

/**
 * Platform API key-pool admin (Day 38) — SUPER_ADMIN only. The pool is platform-global
 * (not tenant data), so every route requires the platform-operator role. Keys are write-
 * only: they can be added/toggled/removed and listed masked, but never read back.
 */
export function keyPoolRoutes(keyPool: KeyPoolService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(Role.SUPER_ADMIN));

  r.get(
    '/',
    ah(async (_req, res) => {
      res.json(await keyPool.list());
    }),
  );

  r.post(
    '/',
    ah(async (req, res) => {
      res.json(await keyPool.add(req.body));
    }),
  );

  r.post(
    '/:id/active',
    ah(async (req, res) => {
      const parsed = activeSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('active must be a boolean');
      res.json(await keyPool.setActive(req.params.id as string, parsed.data.active));
    }),
  );

  r.delete(
    '/:id',
    ah(async (req, res) => {
      res.json(await keyPool.remove(req.params.id as string));
    }),
  );

  return r;
}
