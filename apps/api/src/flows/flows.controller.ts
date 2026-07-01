import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { FlowsService } from './flows.service';

@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('agents/:agentId/flow')
export class FlowsController {
  constructor(private readonly flows: FlowsService) {}

  /** Load (lazily creating) the agent's draft flow graph. Any member (RLS-scoped). */
  @Get()
  async get(@CurrentMembership() ctx: TenantContext, @Param('agentId') agentId: string) {
    return this.flows.getOrCreateDraft(ctx.tenantId, agentId);
  }

  /** Autosave the graph into the draft version. Config writers only. */
  @Roles(...CONFIG_WRITERS)
  @Put()
  async save(
    @CurrentMembership() ctx: TenantContext,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ) {
    return this.flows.saveGraph(ctx.tenantId, agentId, body);
  }
}
