import { AUTOMATION_EVENTS, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { WorkflowDispatchEvent, WorkflowsService } from './workflows.service';

const createSchema = z.object({ name: z.string().min(1).max(120) });
const statusSchema = z.object({ status: z.enum(['active', 'paused', 'draft']) });
const eventSchema = z.object({
  event: z.enum(AUTOMATION_EVENTS),
  callId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  disposition: z.string().max(60).optional(),
  leadStatus: z.string().max(60).optional(),
  contactId: z.string().uuid().optional(),
  to: z.string().max(40).optional(),
});
type EventInput = z.infer<typeof eventSchema>;

/** Build the dispatch event, omitting undefined keys (exactOptionalPropertyTypes). */
function toEvent(d: EventInput): WorkflowDispatchEvent {
  return {
    event: d.event,
    ...(d.callId ? { callId: d.callId } : {}),
    ...(d.agentId ? { agentId: d.agentId } : {}),
    ...(d.disposition ? { disposition: d.disposition } : {}),
    ...(d.leadStatus ? { leadStatus: d.leadStatus } : {}),
    ...(d.contactId ? { contactId: d.contactId } : {}),
    ...(d.to ? { to: d.to } : {}),
  };
}

/**
 * Workflow automation API (Day 85). Reads (list/get/runs/steps) are any-member; mutations
 * (create/save/status/delete) + firing (trigger/dispatch) are config-writer. Mounted at /workflows.
 */
export function workflowsRoutes(workflows: WorkflowsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => res.json(await workflows.list(req.ctx!.tenantId))),
  );
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = createSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('A workflow name is required');
      res.status(201).json(await workflows.create(req.ctx!.tenantId, p.data.name));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) =>
      res.json(await workflows.get(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.put(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await workflows.updateGraph(req.ctx!.tenantId, req.params.id as string, req.body)),
    ),
  );
  r.post(
    '/:id/status',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = statusSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('status must be active | paused | draft');
      res.json(
        await workflows.setStatus(req.ctx!.tenantId, req.params.id as string, p.data.status),
      );
    }),
  );
  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await workflows.remove(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  // ── observability ─────────────────────────────────────────────────────────────
  r.get(
    '/:id/runs',
    ah(async (req, res) =>
      res.json(await workflows.runsFor(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.get(
    '/runs/:runId/steps',
    ah(async (req, res) =>
      res.json(await workflows.stepsFor(req.ctx!.tenantId, req.params.runId as string)),
    ),
  );

  // Manually retry a FAILED run (starts a fresh run with the original event; the failed run stays).
  r.post(
    '/runs/:runId/retry',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await workflows.retryRun(req.ctx!.tenantId, req.params.runId as string)),
    ),
  );

  // ── firing ────────────────────────────────────────────────────────────────────
  r.post(
    '/:id/trigger',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = eventSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('A valid event is required');
      res
        .status(201)
        .json(await workflows.trigger(req.ctx!.tenantId, req.params.id as string, toEvent(p.data)));
    }),
  );
  r.post(
    '/dispatch',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = eventSchema.safeParse(req.body);
      if (!p.success) throw new ValidationError('A valid event is required');
      res.json(await workflows.dispatchEvent(req.ctx!.tenantId, toEvent(p.data)));
    }),
  );

  return r;
}
