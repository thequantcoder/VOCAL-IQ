import { ValidationError, brandingSchema, customDomainInputSchema } from '@vocaliq/shared';
import { type Request, type Response, Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { WhiteLabelService } from './whitelabel.service';

/**
 * White-label API (Day 52). Branding + custom-domain management is session-authenticated;
 * mutations are config-writer actions. RLS-scoped.
 */
export function whitelabelRoutes(wl: WhiteLabelService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/branding',
    ah(async (req, res) => {
      res.json(await wl.getBranding(req.ctx!.tenantId));
    }),
  );
  r.put(
    '/branding',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = brandingSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid branding');
      res.json(await wl.setBranding(req.ctx!.tenantId, parsed.data));
    }),
  );

  r.get(
    '/domain',
    ah(async (req, res) => {
      res.json((await wl.getDomain(req.ctx!.tenantId)) ?? null);
    }),
  );
  r.post(
    '/domain',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = customDomainInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid domain');
      res.status(201).json(await wl.provisionDomain(req.ctx!.tenantId, parsed.data.hostname));
    }),
  );
  r.post(
    '/domain/refresh',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json((await wl.refreshDomain(req.ctx!.tenantId)) ?? null);
    }),
  );
  r.delete(
    '/domain',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await wl.removeDomain(req.ctx!.tenantId));
    }),
  );

  return r;
}

/**
 * Public edge resolution: given an inbound `?host=` (a reseller's custom domain), return just
 * the theme (name + CSS vars) so the gateway / sign-in page can re-brand BEFORE auth. No secrets;
 * a suspended or unknown host resolves to null (falls back to the default theme).
 */
export function whitelabelResolveHandler(wl: WhiteLabelService) {
  return ah(async (req: Request, res: Response) => {
    const host = (req.query.host as string | undefined) ?? req.hostname;
    const resolved = host ? await wl.resolveByHostname(host) : null;
    res.json(
      resolved
        ? { tenantId: resolved.tenantId, name: resolved.name, cssVars: resolved.cssVars }
        : null,
    );
  });
}
