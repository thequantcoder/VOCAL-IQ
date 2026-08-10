import { Role, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import { VoicesService } from './voices.service';

const assignSchema = z.object({
  defaultVoiceId: z.string().uuid(),
  fallbackVoiceId: z.string().uuid().nullish(),
});

/**
 * Voice library API (Day 26). Reads are open to any tenant member; mutations are limited
 * to config writers, and clone approval to owners/admins (separation of duty on the
 * consent gate). Cloning stamps the consent time server-side.
 */
export function voicesRoutes(voices: VoicesService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await voices.list(req.ctx!.tenantId, req.query));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await voices.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  /** Tune stability/similarity/style/pace/pitch on a tenant-owned voice. */
  r.patch(
    '/:id/settings',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await voices.updateSettings(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  /** Assign default + fallback voices to an agent (unapproved clones rejected). */
  r.post(
    '/agents/:agentId/assign',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid voice assignment');
      res.json(
        await voices.assignToAgent(req.ctx!.tenantId, req.params.agentId as string, {
          defaultVoiceId: parsed.data.defaultVoiceId,
          fallbackVoiceId: parsed.data.fallbackVoiceId ?? null,
        }),
      );
    }),
  );

  /** Create a private clone from consented samples (created unapproved). */
  r.post(
    '/clone',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await voices.clone(req.ctx!.tenantId, req.body, new Date().toISOString()));
    }),
  );

  /** Approve a pending clone — owners/admins only. */
  r.post(
    '/:id/approve',
    requireRoles(Role.OWNER, Role.ADMIN),
    ah(async (req, res) => {
      res.json(await voices.approve(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
