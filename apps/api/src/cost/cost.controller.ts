import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CostService } from './cost.service';

const rollupQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  groupBy: z.enum(['day', 'capability', 'provider', 'agent']).default('day'),
});

const rangeQuery = z.object({ from: z.coerce.date(), to: z.coerce.date() });

@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller()
export class CostController {
  constructor(private readonly cost: CostService) {}

  /** Per-call cost breakdown + usage records. Any tenant member (RLS-scoped read). */
  @Get('calls/:id/cost')
  async callCost(@CurrentMembership() ctx: TenantContext, @Param('id') id: string) {
    return this.cost.callCost(ctx.tenantId, id);
  }

  /** Cost rolled up over a date range by day / capability / provider / agent. */
  @Get('costs/rollup')
  async rollup(@CurrentMembership() ctx: TenantContext, @Query() query: unknown) {
    const parsed = rollupQuery.safeParse(query);
    if (!parsed.success) throw new ValidationError('from + to (dates) required; groupBy optional');
    if (parsed.data.to <= parsed.data.from) throw new ValidationError('`to` must be after `from`');
    return this.cost.rollup(ctx.tenantId, parsed.data);
  }

  /** Reconciliation sweep for un-metered COMPLETED calls. Config-writers only. */
  @Roles(...CONFIG_WRITERS)
  @Post('costs/reconcile')
  async reconcile(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    const parsed = rangeQuery.safeParse(body);
    if (!parsed.success) throw new ValidationError('from + to (dates) required');
    return this.cost.reconcile(ctx.tenantId, parsed.data);
  }
}
