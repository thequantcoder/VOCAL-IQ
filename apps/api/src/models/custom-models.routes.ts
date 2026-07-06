import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { CustomModelsService } from './custom-models.service';

const assignSchema = z.object({ customModelId: z.string().uuid().nullable() });

/**
 * Custom-models API (Day 76). Reads are any-member; create/assign/delete are config-writer (they
 * define brand behaviour + record consent). Mounted at /models.
 */
export function customModelsRoutes(models: CustomModelsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => res.json(await models.list(req.ctx!.tenantId))),
  );
  r.get(
    '/:id',
    ah(async (req, res) => res.json(await models.get(req.ctx!.tenantId, req.params.id as string))),
  );
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.status(201).json(await models.create(req.ctx!.tenantId, req.body))),
  );
  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await models.remove(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  r.post(
    '/agents/:agentId/assign',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = assignSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('customModelId (uuid or null) required');
      res.json(
        await models.assignToAgent(
          req.ctx!.tenantId,
          req.params.agentId as string,
          p.data.customModelId,
        ),
      );
    }),
  );

  r.get(
    '/agents/:agentId/resolve',
    ah(async (req, res) =>
      res.json({
        routing: await models.resolveForAgent(req.ctx!.tenantId, req.params.agentId as string),
      }),
    ),
  );

  return r;
}
