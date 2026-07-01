import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role, ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { VoicesService } from './voices.service';

const assignSchema = z.object({
  defaultVoiceId: z.string().uuid(),
  fallbackVoiceId: z.string().uuid().nullish(),
});

/**
 * Voice library API (Day 26). Reads are open to any tenant member; mutations are limited
 * to config writers, and clone approval to owners/admins (separation of duty on the
 * consent gate). Cloning stamps the consent time server-side.
 */
@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('voices')
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  @Get()
  list(@CurrentMembership() ctx: TenantContext, @Query() query: unknown) {
    return this.voices.list(ctx.tenantId, query);
  }

  @Get(':id')
  get(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.voices.get(ctx.tenantId, id);
  }

  /** Tune stability/similarity/style/pace/pitch on a tenant-owned voice. */
  @Roles(...CONFIG_WRITERS)
  @Patch(':id/settings')
  updateSettings(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.voices.updateSettings(ctx.tenantId, id, body);
  }

  /** Assign default + fallback voices to an agent (unapproved clones rejected). */
  @Roles(...CONFIG_WRITERS)
  @Post('agents/:agentId/assign')
  assign(
    @CurrentMembership() ctx: TenantContext,
    @Param('agentId') agentId: string,
    @Body() body: unknown,
  ) {
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Invalid voice assignment');
    return this.voices.assignToAgent(ctx.tenantId, agentId, {
      defaultVoiceId: parsed.data.defaultVoiceId,
      fallbackVoiceId: parsed.data.fallbackVoiceId ?? null,
    });
  }

  /** Create a private clone from consented samples (created unapproved). */
  @Roles(...CONFIG_WRITERS)
  @Post('clone')
  clone(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    return this.voices.clone(ctx.tenantId, body, new Date().toISOString());
  }

  /** Approve a pending clone — owners/admins only. */
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(':id/approve')
  approve(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.voices.approve(ctx.tenantId, id);
  }
}
