import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { WhatsAppCallReadService } from './whatsapp-call-read.service';
import type { WhatsAppCallSettingsService } from './whatsapp-call-settings.service';
import type { WhatsAppCallingService } from './whatsapp-calling.service';
import type { WhatsAppPermissionService } from './whatsapp-permission.service';

/**
 * WhatsApp Business Calling API (WAC-05+). Reads open to members; settings + permission + dialing
 * writes to config-writers. RLS-scoped. The outbound routes (WAC-08) run the compliance gate in the
 * service, so a blocked call returns a 4xx with the reason — the UI never dials into a restriction.
 */

const permissionRequestSchema = z.object({
  waId: z.string().min(3).max(20),
  contactId: z.string().uuid().optional(),
  text: z.string().max(1024).optional(),
  templateName: z.string().max(120).optional(),
  languageCode: z.string().max(10).optional(),
});

const placeCallSchema = z.object({
  to: z.string().min(3).max(20),
  agentId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  businessE164: z.string().max(20).optional(),
});

const inspectQuerySchema = z.object({
  waId: z.string().min(3).max(20),
  contactId: z.string().uuid().optional(),
  businessE164: z.string().max(20).optional(),
});

export function whatsAppCallingRoutes(
  settings: WhatsAppCallSettingsService,
  read: WhatsAppCallReadService,
  permission: WhatsAppPermissionService,
  calling: WhatsAppCallingService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // WAC-07 dashboard: today's KPIs + this-month minutes/tier + recent WhatsApp calls.
  r.get(
    '/overview',
    ah(async (req, res) => {
      res.json(await read.overview(req.ctx!.tenantId));
    }),
  );

  // WAC-04 live-call view: one WhatsApp call's identity + decoded context + status timeline.
  r.get(
    '/calls/:id',
    ah(async (req, res) => {
      res.json(await read.liveCall(req.ctx!.tenantId, req.params.id as string));
    }),
  );

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

  // WAC-08 permission inspector: current permission + pre-dial decision + remaining request caps.
  r.get(
    '/permissions',
    ah(async (req, res) => {
      const parsed = inspectQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('A valid waId is required.');
      const d = parsed.data;
      res.json(
        await permission.inspect(req.ctx!.tenantId, {
          waId: d.waId,
          ...(d.contactId ? { contactId: d.contactId } : {}),
          ...(d.businessE164 ? { businessE164: d.businessE164 } : {}),
        }),
      );
    }),
  );

  // WAC-08 send a permission-request message (enforces the 1/24h + 2/7d caps).
  r.post(
    '/permission-requests',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = permissionRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid permission request.');
      const d = parsed.data;
      res.json(
        await permission.requestPermission(req.ctx!.tenantId, {
          waId: d.waId,
          ...(d.contactId ? { contactId: d.contactId } : {}),
          ...(d.text ? { text: d.text } : {}),
          ...(d.templateName ? { templateName: d.templateName } : {}),
          ...(d.languageCode ? { languageCode: d.languageCode } : {}),
        }),
      );
    }),
  );

  // WAC-08 place a consented outbound call (the service runs the full compliance gate first).
  r.post(
    '/calls',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = placeCallSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid outbound call request.');
      const d = parsed.data;
      res.json(
        await calling.placeOutboundCall(req.ctx!.tenantId, {
          to: d.to,
          agentId: d.agentId,
          ...(d.contactId ? { contactId: d.contactId } : {}),
          ...(d.businessE164 ? { businessE164: d.businessE164 } : {}),
        }),
      );
    }),
  );

  return r;
}
