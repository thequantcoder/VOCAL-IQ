import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { FlowsService } from './flows.service';

const restoreSchema = z.object({ version: z.number().int().min(1) });

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

  /** Compile-gate + publish the draft (pins the version, opens a fresh draft). BUILDER+. */
  @Roles(...CONFIG_WRITERS)
  @Post('publish')
  async publish(@CurrentMembership() ctx: TenantContext, @Param('agentId') agentId: string) {
    return this.flows.publishFlow(ctx.tenantId, agentId);
  }

  /** Version history for the rollback panel (any member — RLS-scoped). */
  @Get('versions')
  async versions(@CurrentMembership() ctx: TenantContext, @Param('agentId') agentId: string) {
    return this.flows.listVersions(ctx.tenantId, agentId);
  }

  /** Rollback: restore a prior version's graph into the draft. BUILDER+. */
  @Roles(...CONFIG_WRITERS)
  @Post('restore')
  async restore(
    @CurrentMembership() ctx: TenantContext,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ) {
    const parsed = restoreSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('version (number) is required');
    return this.flows.restoreVersion(ctx.tenantId, agentId, parsed.data.version);
  }
}
