import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { OutboundService } from './outbound.service';

@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly outbound: OutboundService) {}

  /**
   * Place an outbound call. Config-writer roles only (BUILDER+). Enforces DNC, consent,
   * concurrency + rate gates before dialing; returns the queued Call id.
   */
  @Roles(...CONFIG_WRITERS)
  @Post('outbound')
  async placeOutbound(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    return this.outbound.placeCall(ctx.tenantId, body);
  }

  /**
   * Record a call's final disposition + cost. Reported by the voice service at call end.
   * (Voice→api uses the same tenant scope; a signed service token replaces user auth for
   * this callback when the voice service is deployed separately — tracked for Day 13.)
   */
  @Roles(...CONFIG_WRITERS)
  @Post(':id/disposition')
  async recordDisposition(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.outbound.recordDisposition(ctx.tenantId, id, body);
  }
}
