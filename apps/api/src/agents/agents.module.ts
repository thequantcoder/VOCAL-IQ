import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RouterService } from '../router/router.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AgentController } from './agent.controller';

/** Agents feature — Day 6 ships the router-backed test-completion endpoint. */
@Module({
  imports: [TenancyModule], // TenantGuard, RolesGuard, TenantService
  controllers: [AgentController],
  providers: [RouterService, ClerkAuthGuard],
})
export class AgentsModule {}
