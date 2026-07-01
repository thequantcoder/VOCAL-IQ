import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { BillingModule } from '../billing/billing.module';
import { RouterService } from '../router/router.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AgentController } from './agent.controller';
import { AgentsService } from './agents.service';

/** Agents feature — router-backed test-completion (Day 6) + CRUD for the dashboard (Day 14). */
@Module({
  imports: [TenancyModule, BillingModule], // guards/tenant + EntitlementsService (plan gating)
  controllers: [AgentController],
  providers: [RouterService, ClerkAuthGuard, AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
