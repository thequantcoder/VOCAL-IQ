import { ValidationError } from '@vocaliq/shared';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { EmailService } from './email.service';

const sendBody = z.object({
  contactId: z.string().uuid(),
  template: z.object({ subject: z.string(), body: z.string(), language: z.string().optional() }),
  vars: z.record(z.unknown()).optional(),
  campaignId: z.string().uuid().optional(),
});

/**
 * Email campaign API (Day 72). Capture-consent + send are config-writer actions; sends are hard
 * consent-gated in the service. Mounted at /email.
 */
export function emailRoutes(email: EmailService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants), requireRoles(...CONFIG_WRITERS));

  r.post(
    '/contacts/:id/consent',
    ah(async (req, res) =>
      res
        .status(201)
        .json(await email.captureConsent(req.ctx!.tenantId, req.params.id as string, req.body)),
    ),
  );

  r.post(
    '/send',
    ah(async (req, res) => {
      const p = sendBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('contactId + template required');
      res.json(
        await email.send(
          req.ctx!.tenantId,
          p.data.contactId,
          p.data.template,
          p.data.vars ?? {},
          p.data.campaignId,
        ),
      );
    }),
  );

  return r;
}

/** Public unsubscribe endpoint (Day 72) — unauthenticated, one-click, honoured forever. */
export function unsubscribeHandler(email: EmailService) {
  return ah(async (req: Request, res: Response) => {
    const raw = String(req.params.token ?? '');
    const dot = raw.indexOf('.');
    if (dot < 0) throw new ValidationError('Invalid unsubscribe link');
    const contactId = raw.slice(0, dot);
    const token = raw.slice(dot + 1);
    await email.unsubscribe(contactId, token);
    res
      .type('text/html')
      .send('<p>You have been unsubscribed. You will no longer receive emails.</p>');
  });
}
