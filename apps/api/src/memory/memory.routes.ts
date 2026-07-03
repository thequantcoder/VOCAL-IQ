import { Role, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { MemoryService } from './memory.service';

const pruneSchema = z.object({ retentionDays: z.number().int().min(1).max(3650) });

/**
 * Agent Memory API (Day 34). Reads open to members; edits to config writers; contact-level
 * erase (GDPR) to config writers; prune to owners/admins. All RLS-scoped.
 */
export function memoryRoutes(memory: MemoryService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/contact/:contactId',
    ah(async (req, res) => {
      res.json(await memory.getForContact(req.ctx!.tenantId, req.params.contactId as string));
    }),
  );

  r.put(
    '/:agentId/contact/:contactId',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(
        await memory.upsert(
          req.ctx!.tenantId,
          req.params.agentId as string,
          req.params.contactId as string,
          req.body,
        ),
      );
    }),
  );

  r.delete(
    '/contact/:contactId',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await memory.eraseContact(req.ctx!.tenantId, req.params.contactId as string));
    }),
  );

  r.post(
    '/prune',
    requireRoles(Role.OWNER, Role.ADMIN),
    ah(async (req, res) => {
      const parsed = pruneSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('retentionDays (1..3650) required');
      res.json(await memory.prune(req.ctx!.tenantId, parsed.data.retentionDays));
    }),
  );

  return r;
}
