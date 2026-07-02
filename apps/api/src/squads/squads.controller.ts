import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { SquadsService } from './squads.service';

/**
 * Squads API (Day 27). Reads are open to any tenant member; mutations are limited to
 * config writers. Every call is RLS-scoped by the tenant context.
 */
@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('squads')
export class SquadsController {
  constructor(private readonly squads: SquadsService) {}

  @Get()
  list(@CurrentMembership() ctx: TenantContext) {
    return this.squads.list(ctx.tenantId);
  }

  @Get(':id')
  get(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.squads.get(ctx.tenantId, id);
  }

  @Roles(...CONFIG_WRITERS)
  @Post()
  create(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    return this.squads.create(ctx.tenantId, body);
  }

  @Roles(...CONFIG_WRITERS)
  @Put(':id')
  update(@CurrentMembership() ctx: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    return this.squads.update(ctx.tenantId, id, body);
  }

  @Roles(...CONFIG_WRITERS)
  @Delete(':id')
  remove(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.squads.remove(ctx.tenantId, id);
  }
}
