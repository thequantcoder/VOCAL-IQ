import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import { LeadsService } from './leads.service';

const stageSchema = z.object({ stage: z.string().min(1) });

/**
 * Lead workspace API (Day 29). Reads open to members; mutations to config writers.
 * Every call is RLS-scoped by the tenant context.
 */
export function leadsRoutes(leads: LeadsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(
        await leads.list(req.ctx!.tenantId, {
          status: req.query.status as string | undefined,
          stage: req.query.stage as string | undefined,
          owner: req.query.owner as string | undefined,
        }),
      );
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await leads.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await leads.create(req.ctx!.tenantId, req.body));
    }),
  );

  r.patch(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await leads.update(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  r.post(
    '/:id/stage',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = stageSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid stage');
      res.json(
        await leads.moveStage(req.ctx!.tenantId, req.params.id as string, parsed.data.stage),
      );
    }),
  );

  r.post(
    '/:id/score',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await leads.applyScore(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  return r;
}
