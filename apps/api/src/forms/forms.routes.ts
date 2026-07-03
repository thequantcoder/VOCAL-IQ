import { ValidationError } from '@vocaliq/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { FormsService } from './forms.service';

const activeSchema = z.object({ active: z.boolean() });
const UUID = /^[0-9a-f-]{36}$/i;

/** Forms admin API (Day 37). Reads open to members; mutations to config writers. */
export function formsRoutes(forms: FormsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await forms.list(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await forms.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.get(
    '/:id/submissions',
    ah(async (req, res) => {
      res.json(await forms.submissions(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await forms.create(req.ctx!.tenantId, req.body));
    }),
  );

  r.put(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await forms.update(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  r.post(
    '/:id/active',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = activeSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('active must be a boolean');
      res.json(
        await forms.setActive(req.ctx!.tenantId, req.params.id as string, parsed.data.active),
      );
    }),
  );

  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await forms.remove(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}

/**
 * Public form API — UNAUTHENTICATED (embedded on any site). Safety = active-forms-only,
 * server-side validation/sanitisation, and a per-caller rate limit (FormsService).
 */
export function publicFormsRoutes(forms: FormsService): Router {
  const r = Router();

  r.get(
    '/:id',
    ah(async (req, res) => {
      const id = req.params.id as string;
      if (!UUID.test(id)) throw new ValidationError('Invalid form id');
      res.json(await forms.publicConfig(id));
    }),
  );

  r.post(
    '/:id/submit',
    ah(async (req, res) => {
      const id = req.params.id as string;
      if (!UUID.test(id)) throw new ValidationError('Invalid form id');
      const result = await forms.submit(id, req.body, clientIp(req));
      res.status(result.ok ? 201 : 422).json(result);
    }),
  );

  return r;
}

/** Best-effort caller key for rate limiting (proxy header, else socket address). */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return req.socket.remoteAddress ?? 'unknown';
}
