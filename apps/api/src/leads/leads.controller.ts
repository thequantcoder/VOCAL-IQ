import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { LeadsService } from './leads.service';

const stageSchema = z.object({ stage: z.string().min(1) });

/**
 * Lead workspace API (Day 29). Reads open to members; mutations to config writers.
 * Every call is RLS-scoped by the tenant context.
 */
@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(
    @CurrentMembership() ctx: TenantContext,
    @Query('status') status?: string,
    @Query('stage') stage?: string,
    @Query('owner') owner?: string,
  ) {
    return this.leads.list(ctx.tenantId, { status, stage, owner });
  }

  @Get(':id')
  get(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.leads.get(ctx.tenantId, id);
  }

  @Roles(...CONFIG_WRITERS)
  @Post()
  create(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    return this.leads.create(ctx.tenantId, body);
  }

  @Roles(...CONFIG_WRITERS)
  @Patch(':id')
  update(@CurrentMembership() ctx: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.leads.update(ctx.tenantId, id, body);
  }

  @Roles(...CONFIG_WRITERS)
  @Post(':id/stage')
  moveStage(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = stageSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Invalid stage');
    return this.leads.moveStage(ctx.tenantId, id, parsed.data.stage);
  }

  @Roles(...CONFIG_WRITERS)
  @Post(':id/score')
  applyScore(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.leads.applyScore(ctx.tenantId, id, body);
  }
}
