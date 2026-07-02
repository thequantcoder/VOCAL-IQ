import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CallsModule } from './calls/calls.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CostModule } from './cost/cost.module';
import { DbModule } from './db/db.module';
import { FlowsModule } from './flows/flows.module';
import { HealthController } from './health.controller';
import { RagModule } from './rag/rag.module';
import { SquadsModule } from './squads/squads.module';
import { TemplatesModule } from './templates/templates.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { VoicesModule } from './voices/voices.module';
import { WidgetModule } from './widget/widget.module';

/** Root module. Feature modules (agents, billing, …) are added per the build sequence. */
@Module({
  imports: [
    DbModule,
    AuthModule,
    TenancyModule,
    AgentsModule,
    CallsModule,
    CampaignsModule,
    CostModule,
    BillingModule,
    WidgetModule,
    FlowsModule,
    RagModule,
    SquadsModule,
    TemplatesModule,
    VoicesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
