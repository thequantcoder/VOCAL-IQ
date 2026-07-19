import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MessengerCallReadService } from './messenger-call-read.service';
import type { MessengerCallSettingsService } from './messenger-call-settings.service';
import type { MessengerCallingService } from './messenger-calling.service';
import type { MessengerPermissionService } from './messenger-permission.service';

/**
 * Messenger Calling dashboard API (MEC-04/05/08) — today's KPIs + this-month minutes + recent calls
 * (`/overview`), one call's identity + decoded context + status timeline (`/calls/:id` live-call view),
 * the tenant's call settings (`/settings`, GET open to members, PUT to config-writers), and the MEC-08
 * outbound surface: a live permission inspector (`GET /permissions`) + consented Page-initiated dialing
 * (`POST /calls`, which runs the full compliance gate in the service before any dial). RLS-scoped via the
 * tenant middleware.
 */

const placeCallSchema = z.object({
  psid: z.string().min(1).max(64),
  agentId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  refPayload: z.string().max(512).optional(),
});

const inspectQuerySchema = z.object({
  psid: z.string().min(1).max(64),
  contactId: z.string().uuid().optional(),
});

export function messengerCallingRoutes(
  read: MessengerCallReadService,
  settings: MessengerCallSettingsService,
  permission: MessengerPermissionService,
  calling: MessengerCallingService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // Dashboard: today's KPIs + this-month minutes + recent Messenger calls.
  r.get(
    '/overview',
    ah(async (req, res) => {
      res.json(await read.overview(req.ctx!.tenantId));
    }),
  );

  // Live-call view: one Messenger call's identity + decoded context + status timeline.
  r.get(
    '/calls/:id',
    ah(async (req, res) => {
      res.json(await read.liveCall(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  // Call settings (MEC-05): availability hours + call-button visibility.
  r.get(
    '/settings',
    ah(async (req, res) => {
      res.json(await settings.get(req.ctx!.tenantId));
    }),
  );

  r.put(
    '/settings',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await settings.set(req.ctx!.tenantId, req.body));
    }),
  );

  // MEC-08 permission inspector: the LIVE Meta call-permission + the pre-dial decision for a PSID.
  r.get(
    '/permissions',
    ah(async (req, res) => {
      const parsed = inspectQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('A valid psid is required.');
      const d = parsed.data;
      res.json(
        await permission.inspect(req.ctx!.tenantId, {
          psid: d.psid,
          ...(d.contactId ? { contactId: d.contactId } : {}),
        }),
      );
    }),
  );

  // MEC-08 place a consented outbound call (the service runs the full compliance gate first).
  r.post(
    '/calls',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = placeCallSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid outbound call request.');
      const d = parsed.data;
      res.json(
        await calling.placeOutboundCall(req.ctx!.tenantId, {
          psid: d.psid,
          agentId: d.agentId,
          ...(d.contactId ? { contactId: d.contactId } : {}),
          ...(d.refPayload ? { refPayload: d.refPayload } : {}),
        }),
      );
    }),
  );

  return r;
}
