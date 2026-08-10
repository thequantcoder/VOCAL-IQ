import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { LearningService } from './learning.service';

/**
 * Learn-from-top-reps API (Day 89). Reads (settings, runs) are any-member; the consent toggle, the
 * metered analysis, and applying a suggestion to an agent's persona are config-writer mutations.
 * Every handler is RLS-scoped to `req.ctx.tenantId` — a tenant only ever trains its own agents.
 * Mounted at /learning.
 */
export function learningRoutes(svc: LearningService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // Consent settings — the tenant must opt in before any recording becomes a training signal.
  r.get(
    '/settings',
    ah(async (req, res) => res.json(await svc.getSettings(req.ctx!.tenantId))),
  );
  r.put(
    '/settings',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await svc.setSettings(req.ctx!.tenantId, req.body))),
  );

  // Analyze an agent's TOP consent-eligible calls (metered LLM — config-writer, self-audit D).
  r.post(
    '/agents/:agentId/analyze',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await svc.analyze(req.ctx!.tenantId, req.params.agentId as string)),
    ),
  );
  r.get(
    '/agents/:agentId/runs',
    ah(async (req, res) =>
      res.json(await svc.listRuns(req.ctx!.tenantId, req.params.agentId as string)),
    ),
  );
  r.get(
    '/runs/:runId',
    ah(async (req, res) =>
      res.json(await svc.getRun(req.ctx!.tenantId, req.params.runId as string)),
    ),
  );

  // Apply a reviewed suggestion → appends it to the agent's system prompt (still needs re-test +
  // re-publish — self-audit A). Config-writer, since it mutates the agent.
  r.post(
    '/runs/:runId/suggestions/:suggestionId/apply',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(
        await svc.applySuggestion(
          req.ctx!.tenantId,
          req.params.runId as string,
          req.params.suggestionId as string,
        ),
      ),
    ),
  );

  return r;
}
