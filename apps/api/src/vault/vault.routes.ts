import { Provider, Role, ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { RoutingDefaultsService } from './routing-defaults.service';
import type { Actor, KeyScope, VaultService } from './vault.service';

/** Roles allowed near secrets — deliberately NOT builders/viewers. SUPER_ADMIN always passes. */
const KEY_MANAGERS: Role[] = [Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN];

const addKeyBody = z.object({
  provider: z.nativeEnum(Provider),
  apiKey: z.string().min(8),
  scope: z.enum(['platform', 'tenant']).default('tenant'),
});
const rotateBody = z.object({ apiKey: z.string().min(8) });
const scopeQuery = z.enum(['platform', 'tenant']).default('tenant');

/**
 * Key vault + routing-defaults API (Day 57). Gated to key-manager roles; the service enforces the
 * finer rule (platform keys + platform routing are SUPER_ADMIN-only). Responses are always masked
 * — a stored secret is never returned. Mounted at /admin/vault.
 */
export function vaultRoutes(
  vault: VaultService,
  routing: RoutingDefaultsService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...KEY_MANAGERS));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  // ── Keys ──
  r.get(
    '/keys',
    ah(async (req, res) => {
      const scope = scopeQuery.parse((req.query.scope as string) ?? 'tenant') as KeyScope;
      res.json(await vault.listKeys(actorOf(req), scope));
    }),
  );

  r.post(
    '/keys',
    ah(async (req, res) => {
      const p = addKeyBody.safeParse(req.body);
      if (!p.success) throw new ValidationError(p.error.issues[0]?.message ?? 'Invalid key');
      res.status(201).json(await vault.addKey(actorOf(req), p.data));
    }),
  );

  r.post(
    '/keys/:id/rotate',
    ah(async (req, res) => {
      const p = rotateBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('A new apiKey is required');
      res.json(await vault.rotate(actorOf(req), req.params.id as string, p.data.apiKey));
    }),
  );

  r.delete(
    '/keys/:id',
    ah(async (req, res) => {
      res.json(await vault.revoke(actorOf(req), req.params.id as string));
    }),
  );

  // ── Routing defaults ──
  r.get(
    '/routing/platform',
    ah(async (_req, res) => {
      res.json(await routing.getPlatform());
    }),
  );
  r.put(
    '/routing/platform',
    ah(async (req, res) => {
      res.json(await routing.setPlatform(actorOf(req), req.body));
    }),
  );
  r.get(
    '/routing/tenant',
    ah(async (req, res) => {
      res.json(await routing.getTenant(req.ctx!.tenantId));
    }),
  );
  r.put(
    '/routing/tenant',
    ah(async (req, res) => {
      res.json(await routing.setTenant(req.ctx!.tenantId, req.body));
    }),
  );

  return r;
}
