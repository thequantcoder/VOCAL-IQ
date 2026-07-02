import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CampaignsService } from './campaigns.service';

const statusSchema = z.object({ status: z.string().min(1) });

/**
 * Campaign API (Day 28). Reads open to members; create/import/status to config writers.
 * Every call is RLS-scoped by the tenant context.
 */
@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@CurrentMembership() ctx: TenantContext) {
    return this.campaigns.list(ctx.tenantId);
  }

  @Get(':id')
  get(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.campaigns.get(ctx.tenantId, id);
  }

  @Get(':id/monitor')
  monitor(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.campaigns.monitor(ctx.tenantId, id);
  }

  @Roles(...CONFIG_WRITERS)
  @Post()
  create(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    return this.campaigns.create(ctx.tenantId, body);
  }

  @Roles(...CONFIG_WRITERS)
  @Post(':id/import')
  importContacts(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.campaigns.import(ctx.tenantId, id, body);
  }

  @Roles(...CONFIG_WRITERS)
  @Post(':id/status')
  setStatus(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Invalid status');
    return this.campaigns.setStatus(ctx.tenantId, id, parsed.data.status);
  }
}
