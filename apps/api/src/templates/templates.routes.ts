import { AGENT_TEMPLATES, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { TemplatesService } from './templates.service';

const cloneSchema = z.object({ name: z.string().max(120).optional() });

/** Agent templates API (Day 24) — catalogue + clone-into-agent. RLS-scoped. */
export function templatesRoutes(templates: TemplatesService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  /** The built-in template catalogue (metadata; the starter graph is applied on clone). */
  r.get(
    '/',
    ah(async (_req, res) => {
      res.json(
        AGENT_TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          description: t.description,
          type: t.type,
          languages: t.languages,
          persona: t.persona,
        })),
      );
    }),
  );

  /** Clone a template into a new agent (persona + starter flow). Config writers only. */
  r.post(
    '/:id/clone',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = cloneSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError('Invalid clone request');
      res.json(await templates.clone(req.ctx!.tenantId, req.params.id as string, parsed.data.name));
    }),
  );

  return r;
}
