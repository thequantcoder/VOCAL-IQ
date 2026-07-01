import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RouterService } from '../router/router.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AgentController } from './agent.controller';
import { AgentsService } from './agents.service';

/** Agents feature — router-backed test-completion (Day 6) + CRUD for the dashboard (Day 14). */
@Module({
  imports: [TenancyModule], // TenantGuard, RolesGuard, TenantService
  controllers: [AgentController],
  providers: [RouterService, ClerkAuthGuard, AgentsService],
})
export class AgentsModule {}
