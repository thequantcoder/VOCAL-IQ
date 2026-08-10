import { API_SCOPES, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { ApiKeyService } from './api-key.service';

const createSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  rateLimitPerMin: z.number().int().min(1).max(6000).optional(),
});

/** API-key management (Day 48). Session-authenticated; mutations are config-writer actions. */
export function apiKeyRoutes(keys: ApiKeyService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await keys.list(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid API key');
      // The plaintext `key` is included in this response ONLY — never retrievable again.
      res.status(201).json(
        await keys.create(req.ctx!.tenantId, {
          name: parsed.data.name,
          scopes: parsed.data.scopes,
          ...(parsed.data.rateLimitPerMin ? { rateLimitPerMin: parsed.data.rateLimitPerMin } : {}),
        }),
      );
    }),
  );

  r.post(
    '/:id/revoke',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await keys.revoke(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
