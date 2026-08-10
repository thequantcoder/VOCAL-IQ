import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { DisclosureService } from './disclosure.service';

const callIdBody = z.object({ callId: z.string().uuid() });

/**
 * AI disclosure API (Day 71). Config + templates are readable by members; setting config is a
 * config-writer action. Disclosure logging + human-opt-out are recorded by the voice service.
 * Mounted at /disclosure.
 */
export function disclosureRoutes(disc: DisclosureService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/templates',
    ah(async (_req, res) => res.json(disc.templates())),
  );
  r.get(
    '/config',
    ah(async (req, res) => res.json(await disc.getConfig(req.ctx!.tenantId))),
  );
  r.put(
    '/config',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await disc.setConfig(req.ctx!.tenantId, req.body))),
  );

  r.post(
    '/log',
    ah(async (req, res) => {
      const p = z
        .object({ callId: z.string().uuid(), text: z.string().min(1) })
        .safeParse(req.body);
      if (!p.success) throw new ValidationError('callId + text required');
      res.json(await disc.logDisclosure(req.ctx!.tenantId, p.data.callId, p.data.text));
    }),
  );

  r.post(
    '/opt-out',
    ah(async (req, res) => {
      const p = callIdBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('callId required');
      res.json(await disc.recordHumanOptOut(req.ctx!.tenantId, p.data.callId));
    }),
  );

  return r;
}
