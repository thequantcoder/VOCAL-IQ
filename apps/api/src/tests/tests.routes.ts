import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { TestsService } from './tests.service';

const runSchema = z.object({ llm: z.boolean().optional() });

/**
 * Agent testing API (Day 33). Scenarios are per-agent; reads open to members, mutations +
 * runs to config writers. Mounted at /agents/:agentId/tests (agentId from the path).
 */
export function testsRoutes(tests: TestsService, tenants: TenantService): Router {
  const r = Router({ mergeParams: true });
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/scenarios',
    ah(async (req, res) => {
      res.json(await tests.listScenarios(req.ctx!.tenantId, req.params.agentId as string));
    }),
  );

  r.post(
    '/scenarios',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(
        await tests.createScenario(req.ctx!.tenantId, req.params.agentId as string, req.body),
      );
    }),
  );

  r.delete(
    '/scenarios/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await tests.deleteScenario(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.get(
    '/runs',
    ah(async (req, res) => {
      res.json(await tests.listRuns(req.ctx!.tenantId, req.params.agentId as string));
    }),
  );

  r.post(
    '/run',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = runSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError('Invalid run options');
      res.json(
        await tests.run(req.ctx!.tenantId, req.params.agentId as string, {
          ...(parsed.data.llm !== undefined ? { llm: parsed.data.llm } : {}),
        }),
      );
    }),
  );

  return r;
}
