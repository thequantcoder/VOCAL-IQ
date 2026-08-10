import { Role, ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, FraudService } from './fraud.service';

const resolveBody = z.object({
  resolution: z.enum(['resume', 'dismiss', 'keep_suspended']),
  notes: z.string().max(2000).optional(),
});

/**
 * Fraud/abuse API (Day 70). A tenant admin sees its own cases + can run a self-check; the
 * super-admin reviews cases across the platform (resume/dismiss). Mounted at /fraud.
 */
export function fraudRoutes(fraud: FraudService, tenants: TenantService): Router {
  const r = Router();
  r.use(
    authMiddleware,
    tenantMiddleware(tenants),
    requireRoles(Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN),
  );

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  r.get(
    '/cases',
    ah(async (req, res) =>
      res.json(await fraud.listCases(actorOf(req), req.query.status as string | undefined)),
    ),
  );

  r.get(
    '/scale-check',
    ah(async (req, res) => res.json(await fraud.assertCanScale(req.ctx!.tenantId))),
  );

  r.post(
    '/evaluate',
    ah(async (req, res) =>
      res.json(await fraud.evaluateAndEnforce(req.ctx!.tenantId, undefined, req.ctx!.userId)),
    ),
  );

  r.post(
    '/cases/:id/resolve',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (req, res) => {
      const p = resolveBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('A resolution is required');
      res.json(
        await fraud.resolveCase(
          actorOf(req),
          req.params.id as string,
          p.data.resolution,
          p.data.notes,
        ),
      );
    }),
  );

  return r;
}
