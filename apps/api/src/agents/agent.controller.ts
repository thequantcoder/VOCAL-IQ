import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { llmCostUsd } from '@vocaliq/provider-router';
import { NotFoundError, Role, ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { PrismaService } from '../db/prisma.service';
import { RouterService } from '../router/router.service';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';

const testCompleteSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  system: z.string().max(8_000).optional(),
  model: z.string().max(80).optional(),
});

@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('agents')
export class AgentController {
  constructor(
    private readonly db: PrismaService,
    private readonly router: RouterService,
  ) {}

  /**
   * Run a one-off completion through the provider router for an agent in the
   * caller's tenant. Config-writer roles only (BUILDER+); records cost.
   */
  @Roles(Role.OWNER, Role.ADMIN, Role.BUILDER, Role.RESELLER_ADMIN)
  @Post(':id/test-complete')
  async testComplete(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = testCompleteSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('prompt is required (1–8000 chars)');

    // Agent must belong to the active tenant (RLS-scoped read).
    const agent = await this.db.withTenant(ctx.tenantId, (tx) =>
      tx.agent.findFirst({ where: { id }, select: { id: true, name: true } }),
    );
    if (!agent) throw new NotFoundError('Agent not found');

    const result = await this.router.complete({
      tenantId: ctx.tenantId,
      agentId: agent.id,
      messages: [{ role: 'user', content: parsed.data.prompt }],
      ...(parsed.data.system ? { system: parsed.data.system } : {}),
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
      maxTokens: 256,
    });

    return {
      agentId: agent.id,
      model: result.model,
      text: result.text,
      usage: result.usage,
      costUsd: llmCostUsd(result.model, result.usage.inputTokens, result.usage.outputTokens),
    };
  }
}
