import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { CallsModule } from './calls/calls.module';
import { CostModule } from './cost/cost.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { TenancyModule } from './tenancy/tenancy.module';

/** Root module. Feature modules (agents, billing, …) are added per the build sequence. */
@Module({
  imports: [DbModule, AuthModule, TenancyModule, AgentsModule, CallsModule, CostModule],
  controllers: [HealthController],
})
export class AppModule {}
