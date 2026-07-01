import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CallsModule } from './calls/calls.module';
import { CostModule } from './cost/cost.module';
import { DbModule } from './db/db.module';
import { FlowsModule } from './flows/flows.module';
import { HealthController } from './health.controller';
import { TenancyModule } from './tenancy/tenancy.module';
import { WidgetModule } from './widget/widget.module';

/** Root module. Feature modules (agents, billing, …) are added per the build sequence. */
@Module({
  imports: [
    DbModule,
    AuthModule,
    TenancyModule,
    AgentsModule,
    CallsModule,
    CostModule,
    BillingModule,
    WidgetModule,
    FlowsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
