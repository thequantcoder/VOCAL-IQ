import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BillingController, BillingWebhookController } from './billing.controller';
import { EntitlementsService } from './entitlements.service';
import { PlansService } from './plans.service';
import { BILLING_PROCESSOR, PendingBillingProcessor } from './processor';
import { UsageReporterService } from './usage-reporter.service';
import { BillingWebhookService } from './webhook.service';

/**
 * Billing (Day 15): plans, entitlements/gating, metered usage, proration, dunning, and
 * the Stripe webhook. The processor is PendingBillingProcessor until STRIPE_* keys are
 * set (memory: stripe-live-test-pending), then swapped for the Stripe implementation.
 */
@Module({
  imports: [DbModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    PlansService,
    EntitlementsService,
    UsageReporterService,
    BillingWebhookService,
    { provide: BILLING_PROCESSOR, useClass: PendingBillingProcessor },
  ],
  exports: [EntitlementsService, UsageReporterService],
})
export class BillingModule {}
