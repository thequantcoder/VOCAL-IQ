import { Role, ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { Actor, SsoService } from './sso.service';

const ADMINS: Role[] = [Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN];

/**
 * SSO admin config API (Day 59) — owner/admin of the tenant configures its IdP. Mounted at
 * /admin/sso, session-authenticated + tenant-scoped.
 */
export function ssoAdminRoutes(sso: SsoService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...ADMINS));
  const actorOf = (req: Request): Actor => ({
    userId: req.ctx!.userId,
    tenantId: req.ctx!.tenantId,
    role: req.ctx!.role,
  });

  r.get(
    '/',
    ah(async (req, res) => res.json(await sso.getConnection(req.ctx!.tenantId))),
  );
  r.put(
    '/',
    ah(async (req, res) => res.json(await sso.configure(actorOf(req), req.body))),
  );
  r.get(
    '/metadata',
    ah(async (req, res) => {
      res.type('application/xml').send(sso.metadata(req.ctx!.tenantId));
    }),
  );

  return r;
}

/**
 * Public SSO endpoints (Day 59) — the interactive login/callback + SP metadata + SCIM directory
 * sync. Unauthenticated by session: login/callback are the auth entry; SCIM is bearer-token
 * authenticated per tenant (verified in the service). Mounted at /auth/sso and /scim/v2.
 */
export function ssoPublicRoutes(sso: SsoService): Router {
  const r = Router();

  // SP metadata (public — the tenant hands it to their IdP).
  r.get(
    '/:tenantId/metadata',
    ah(async (req, res) => {
      res.type('application/xml').send(sso.metadata(req.params.tenantId as string));
    }),
  );

  // Begin login → redirect to the IdP.
  r.get(
    '/:tenantId/login',
    ah(async (req, res) => {
      const { url } = await sso.initiateLogin(req.params.tenantId as string);
      res.redirect(url);
    }),
  );

  // IdP callback → JIT-provision + issue a session token.
  r.all(
    '/:tenantId/callback',
    ah(async (req, res) => {
      const code = (req.query.code as string) ?? (req.body?.SAMLResponse as string) ?? '';
      if (!code) throw new ValidationError('Missing SSO callback code/assertion');
      const result = await sso.handleCallback(req.params.tenantId as string, code);
      res.json(result); // { token, userId } — the web exchanges this for a session
    }),
  );

  return r;
}

/** SCIM 2.0 directory-sync endpoints — bearer-token auth per tenant (in the service). */
export function scimRoutes(sso: SsoService): Router {
  const r = Router();

  r.post(
    '/:tenantId/Users',
    ah(async (req, res) => {
      const out = await sso.scimProvision(
        req.params.tenantId as string,
        req.headers.authorization,
        req.body,
      );
      res.status(201).json(out);
    }),
  );
  r.patch(
    '/:tenantId/Users',
    ah(async (req, res) => {
      res.json(
        await sso.scimProvision(req.params.tenantId as string, req.headers.authorization, req.body),
      );
    }),
  );
  r.delete(
    '/:tenantId/Users/:email',
    ah(async (req, res) => {
      res.json(
        await sso.scimDeprovision(
          req.params.tenantId as string,
          req.headers.authorization,
          req.params.email as string,
        ),
      );
    }),
  );

  return r;
}
