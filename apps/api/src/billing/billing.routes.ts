import { BillingError, ValidationError } from '@vocaliq/shared';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { EntitlementsService } from './entitlements.service';
import type { PlansService } from './plans.service';
import type { BillingProcessor } from './processor';
import type { BillingWebhookService } from './webhook.service';

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/** Authenticated billing routes: plan catalog, subscription/entitlements, checkout. */
export function billingRoutes(
  plans: PlansService,
  entitlements: EntitlementsService,
  processor: BillingProcessor,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/plans',
    ah(async (req, res) => {
      res.json(await plans.listPlans(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/subscription',
    ah(async (req, res) => {
      const [subscription, ent] = await Promise.all([
        plans.currentSubscription(req.ctx!.tenantId),
        entitlements.entitlements(req.ctx!.tenantId),
      ]);
      res.json({ subscription, entitlements: ent });
    }),
  );

  r.post(
    '/checkout',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('planId, successUrl, cancelUrl required');
      res.json(
        await processor.createCheckoutSession({ tenantId: req.ctx!.tenantId, ...parsed.data }),
      );
    }),
  );

  return r;
}

/**
 * Stripe webhook handler — UNAUTHENTICATED; security = signature verified over the RAW
 * body. Mounted in main.ts with `express.raw()` BEFORE the JSON parser so `req.body` is a
 * Buffer. Gated until STRIPE_WEBHOOK_SECRET is set.
 */
export function billingWebhookHandler(webhook: BillingWebhookService) {
  return ah(async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BillingError('Billing webhooks are not configured.');
    const signature = req.headers['stripe-signature'] as string | undefined;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
    const result = await webhook.handle(raw, signature, secret);
    res.json({ received: true, ...result });
  });
}
