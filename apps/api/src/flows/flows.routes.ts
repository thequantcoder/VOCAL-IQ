import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { FlowsService } from './flows.service';

const restoreSchema = z.object({ version: z.number().int().min(1) });

/**
 * Flow builder API (Day 17), mounted under `agents/:agentId/flow`. RLS-scoped:
 * draft load/autosave, version history, publish + rollback.
 */
export function flowsRoutes(flows: FlowsService, tenants: TenantService): Router {
  const r = Router({ mergeParams: true });
  r.use(authMiddleware, tenantMiddleware(tenants));

  /** Load (lazily creating) the agent's draft flow graph. Any member (RLS-scoped). */
  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await flows.getOrCreateDraft(req.ctx!.tenantId, req.params.agentId as string));
    }),
  );

  /** Autosave the graph into the draft version. Config writers only. */
  r.put(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await flows.saveGraph(req.ctx!.tenantId, req.params.agentId as string, req.body));
    }),
  );

  /** Compile-gate + publish the draft (pins the version, opens a fresh draft). BUILDER+. */
  r.post(
    '/publish',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await flows.publishFlow(req.ctx!.tenantId, req.params.agentId as string));
    }),
  );

  /** Version history for the rollback panel (any member — RLS-scoped). */
  r.get(
    '/versions',
    ah(async (req, res) => {
      res.json(await flows.listVersions(req.ctx!.tenantId, req.params.agentId as string));
    }),
  );

  /** Rollback: restore a prior version's graph into the draft. BUILDER+. */
  r.post(
    '/restore',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = restoreSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('version (number) is required');
      res.json(
        await flows.restoreVersion(
          req.ctx!.tenantId,
          req.params.agentId as string,
          parsed.data.version,
        ),
      );
    }),
  );

  return r;
}
