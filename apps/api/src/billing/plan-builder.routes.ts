import { Role, ValidationError, planInputSchema } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, PlanBuilderService } from './plan-builder.service';

const createBody = planInputSchema.extend({ scope: z.enum(['global', 'own']).default('own') });

/**
 * No-code plan builder API (Day 56). Gated to admins (SUPER_ADMIN + RESELLER_ADMIN); the service
 * enforces the finer scope (a reseller manages only its own plans, global plans are super-admin
 * only). Mounted at /admin/plans.
 */
export function planBuilderRoutes(builder: PlanBuilderService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(Role.RESELLER_ADMIN));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await builder.list(actorOf(req)));
    }),
  );

  r.post(
    '/',
    ah(async (req, res) => {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid plan');
      const { scope, ...input } = parsed.data;
      res.status(201).json(await builder.create(actorOf(req), input, scope));
    }),
  );

  r.put(
    '/:id',
    ah(async (req, res) => {
      const parsed = planInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid plan');
      res.json(await builder.update(actorOf(req), req.params.id as string, parsed.data));
    }),
  );

  r.post(
    '/:id/archive',
    ah(async (req, res) => {
      res.json(await builder.archive(actorOf(req), req.params.id as string));
    }),
  );

  r.post(
    '/:id/sync',
    ah(async (req, res) => {
      res.json(await builder.sync(actorOf(req), req.params.id as string));
    }),
  );

  return r;
}
