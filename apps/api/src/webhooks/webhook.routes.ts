import { ValidationError, WEBHOOK_EVENTS } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { WebhookService } from './webhook.service';

const registerSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  secret: z.string().min(8).max(200).optional(),
});

/** Webhook management (Day 48). Session-authenticated; mutations are config-writer actions. */
export function webhookRoutes(webhooks: WebhookService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await webhooks.list(req.ctx!.tenantId));
    }),
  );

  r.get('/events', (_req, res) => {
    res.json(WEBHOOK_EVENTS);
  });

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid webhook');
      // The signing `secret` is returned ONCE here.
      res.status(201).json(
        await webhooks.register(req.ctx!.tenantId, {
          url: parsed.data.url,
          events: parsed.data.events,
          ...(parsed.data.secret ? { secret: parsed.data.secret } : {}),
        }),
      );
    }),
  );

  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await webhooks.remove(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  return r;
}
