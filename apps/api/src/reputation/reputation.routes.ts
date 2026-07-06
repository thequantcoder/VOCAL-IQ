import { ValidationError, attestationSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { ReputationService } from './reputation.service';

const attestBody = z.object({ callId: z.string().uuid(), level: attestationSchema });

/**
 * Caller reputation API (Day 69). Number health is readable by members; branded caller ID +
 * reputation refresh are config-writer actions. Mounted at /reputation.
 */
export function reputationRoutes(rep: ReputationService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/health',
    ah(async (req, res) => res.json(await rep.health(req.ctx!.tenantId))),
  );

  r.post(
    '/attestation',
    ah(async (req, res) => {
      const p = attestBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('callId + attestation level required');
      res.json(await rep.recordAttestation(req.ctx!.tenantId, p.data.callId, p.data.level));
    }),
  );

  r.put(
    '/numbers/:id/branded',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await rep.setBrandedCallerId(req.ctx!.tenantId, req.params.id as string, req.body)),
    ),
  );

  r.post(
    '/numbers/:id/refresh',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await rep.refresh(req.ctx!.tenantId, req.params.id as string))),
  );

  return r;
}
