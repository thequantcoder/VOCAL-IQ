import { ValidationError, automationInputSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { AutomationsService } from './automations.service';

const activeSchema = z.object({ active: z.boolean() });

const dispatchSchema = z.object({
  event: z.enum(['call_ended', 'disposition_set', 'lead_status_changed']),
  callId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  disposition: z.string().max(60).optional(),
  leadStatus: z.string().max(60).optional(),
  contactId: z.string().uuid().optional(),
  to: z.string().max(32).optional(),
});

/**
 * Automations API (Day 47). Reads open to members; create/toggle/delete + manual dispatch are
 * config-writer actions. RLS-scoped. In production the post-call bundle calls `dispatch` on
 * call-end; the `/dispatch` route lets an operator fire a test event.
 */
export function automationsRoutes(automations: AutomationsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await automations.list(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = automationInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid automation');
      res.status(201).json(await automations.create(req.ctx!.tenantId, parsed.data));
    }),
  );

  r.patch(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = activeSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('active (boolean) is required');
      res.json(
        await automations.setActive(req.ctx!.tenantId, req.params.id as string, parsed.data.active),
      );
    }),
  );

  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await automations.remove(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/dispatch',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = dispatchSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('A valid event is required');
      const d = parsed.data;
      res.json(
        await automations.dispatch(req.ctx!.tenantId, {
          event: d.event,
          ...(d.callId ? { callId: d.callId } : {}),
          ...(d.agentId ? { agentId: d.agentId } : {}),
          ...(d.disposition ? { disposition: d.disposition } : {}),
          ...(d.leadStatus ? { leadStatus: d.leadStatus } : {}),
          ...(d.contactId ? { contactId: d.contactId } : {}),
          ...(d.to ? { to: d.to } : {}),
        }),
      );
    }),
  );

  return r;
}
