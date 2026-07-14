import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { CampaignsService } from './campaigns.service';

const statusSchema = z.object({ status: z.string().min(1) });

/**
 * Campaign API (Day 28). Reads open to members; create/import/status to config writers.
 * Every call is RLS-scoped by the tenant context.
 */
export function campaignsRoutes(campaigns: CampaignsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await campaigns.list(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await campaigns.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.get(
    '/:id/monitor',
    ah(async (req, res) => {
      res.json(await campaigns.monitor(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  // Re-queue FAILED contacts for another attempt (PARITY-10 retry knob).
  r.post(
    '/:id/retry-failed',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await campaigns.retryFailed(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await campaigns.create(req.ctx!.tenantId, req.body));
    }),
  );

  r.post(
    '/:id/import',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await campaigns.import(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  r.post(
    '/:id/status',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Invalid status');
      res.json(
        await campaigns.setStatus(req.ctx!.tenantId, req.params.id as string, parsed.data.status),
      );
    }),
  );

  /** Set the campaign's dialer mode/pacing config (Day 79 — config writers only). */
  r.put(
    '/:id/dialer',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(
        await campaigns.setDialerConfig(req.ctx!.tenantId, req.params.id as string, req.body),
      );
    }),
  );

  return r;
}
