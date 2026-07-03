import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { SearchService } from './search.service';

const searchQuery = z.object({
  q: z.string().min(1).max(500),
  mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
  agentId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Transcript search API (Day 42). Search is open to any tenant member (RLS-scoped);
 * reindex is a config-writer action (it spends embedding budget).
 */
export function searchRoutes(search: SearchService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/transcripts',
    ah(async (req, res) => {
      const parsed = searchQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('A non-empty query (q) is required');
      const { q, mode, agentId, from, to, limit } = parsed.data;
      if (from && to && to <= from) throw new ValidationError('to must be after from');
      res.json(
        await search.search(req.ctx!.tenantId, {
          q,
          ...(mode ? { mode } : {}),
          ...(agentId ? { agentId } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(limit ? { limit } : {}),
        }),
      );
    }),
  );

  r.post(
    '/reindex',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await search.reindexTenant(req.ctx!.tenantId));
    }),
  );

  return r;
}
