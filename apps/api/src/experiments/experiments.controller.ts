import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { ExperimentsService } from './experiments.service';

const statusSchema = z.object({ status: z.string().min(1) });

/**
 * A/B experiments API (Day 30). Reads open to members; mutations to config writers.
 * Every call is RLS-scoped by the tenant context.
 */
@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('experiments')
export class ExperimentsController {
  constructor(private readonly experiments: ExperimentsService) {}

  @Get()
  list(@CurrentMembership() ctx: TenantContext) {
    return this.experiments.list(ctx.tenantId);
  }

  @Get(':id')
  get(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.experiments.get(ctx.tenantId, id);
  }

  @Get(':id/results')
  results(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.experiments.results(ctx.tenantId, id);
  }

  @Roles(...CONFIG_WRITERS)
  @Post()
  create(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    return this.experiments.create(ctx.tenantId, body);
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
    return this.experiments.setStatus(ctx.tenantId, id, parsed.data.status);
  }
}
