import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import { ExperimentsService } from './experiments.service';

const statusSchema = z.object({ status: z.string().min(1) });

/**
 * A/B experiments API (Day 30). Reads open to members; mutations to config writers.
 * Every call is RLS-scoped by the tenant context.
 */
export function experimentsRoutes(experiments: ExperimentsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await experiments.list(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await experiments.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.get(
    '/:id/results',
    ah(async (req, res) => {
      res.json(await experiments.results(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await experiments.create(req.ctx!.tenantId, req.body));
    }),
  );

  r.post(
    '/:id/status',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid status');
      res.json(
        await experiments.setStatus(req.ctx!.tenantId, req.params.id as string, parsed.data.status),
      );
    }),
  );

  return r;
}
