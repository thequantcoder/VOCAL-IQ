import { Role, ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, KeyScope } from '../vault/vault.service';
import type { MessagingKeyVault } from './messaging-key-vault';
import { messagingProviderCatalogue } from './provider-specs';

/** Roles allowed near secrets — deliberately not builders/viewers. SUPER_ADMIN always passes. */
const KEY_MANAGERS: Role[] = [Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN];

const setBody = z.object({
  providerId: z.string().min(1),
  creds: z.record(z.string(), z.string()),
  scope: z.enum(['platform', 'tenant']).default('tenant'),
});
const scopeQuery = z.enum(['platform', 'tenant']).default('tenant');

/**
 * Per-tenant BYOK messaging-credential API (GME-01). Gated to key-manager roles; the service
 * enforces the finer rule (platform-scope is SUPER_ADMIN-only). Responses are always masked — a
 * stored secret is never returned. Mounted at /messaging/credentials.
 */
export function messagingCredentialsRoutes(
  vault: MessagingKeyVault,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...KEY_MANAGERS));

  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  /** The provider catalogue (secret-free) — which providers exist + which fields they need. */
  r.get(
    '/catalogue',
    ah(async (_req, res) => {
      res.json(messagingProviderCatalogue());
    }),
  );

  r.get(
    '/',
    ah(async (req, res) => {
      const scope = scopeQuery.parse((req.query.scope as string) ?? 'tenant') as KeyScope;
      res.json(await vault.listCredentials(actorOf(req), scope));
    }),
  );

  r.post(
    '/',
    ah(async (req, res) => {
      const p = setBody.safeParse(req.body);
      if (!p.success) throw new ValidationError(p.error.issues[0]?.message ?? 'Invalid credential');
      res.status(201).json(await vault.setCredential(actorOf(req), p.data));
    }),
  );

  r.delete(
    '/:id',
    ah(async (req, res) => {
      res.json(await vault.deleteCredential(actorOf(req), req.params.id as string));
    }),
  );

  return r;
}
