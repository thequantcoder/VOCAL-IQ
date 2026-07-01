import { Body, Controller, Get, Headers, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { BillingError, ValidationError } from '@vocaliq/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { EntitlementsService } from './entitlements.service';
import { PlansService } from './plans.service';
import { BILLING_PROCESSOR, type BillingProcessor } from './processor';
import { BillingWebhookService } from './webhook.service';

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
    @Inject(BILLING_PROCESSOR) private readonly processor: BillingProcessor,
  ) {}

  /** Plan catalog (any member). */
  @Get('plans')
  async listPlans(@CurrentMembership() ctx: TenantContext) {
    return this.plans.listPlans(ctx.tenantId);
  }

  /** Current subscription + resolved entitlements/limits (any member). */
  @Get('subscription')
  async subscription(@CurrentMembership() ctx: TenantContext) {
    const [subscription, entitlements] = await Promise.all([
      this.plans.currentSubscription(ctx.tenantId),
      this.entitlements.entitlements(ctx.tenantId),
    ]);
    return { subscription, entitlements };
  }

  /** Start a checkout to subscribe/upgrade (config writers). Gated until Stripe is set. */
  @Roles(...CONFIG_WRITERS)
  @Post('checkout')
  async checkout(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('planId, successUrl, cancelUrl required');
    return this.processor.createCheckoutSession({ tenantId: ctx.tenantId, ...parsed.data });
  }
}

/**
 * Stripe webhook — UNAUTHENTICATED (Stripe has no Clerk session); security comes from
 * the signature verified over the raw body. Kept on its own controller so the auth guard
 * stack doesn't apply.
 */
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly webhook: BillingWebhookService) {}

  @Post('webhook')
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BillingError('Billing webhooks are not configured.');
    const raw = req.rawBody?.toString('utf8') ?? '';
    const result = await this.webhook.handle(raw, signature, secret);
    return { received: true, ...result };
  }
}
