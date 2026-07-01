import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AGENT_TEMPLATES, ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { TemplatesService } from './templates.service';

const cloneSchema = z.object({ name: z.string().max(120).optional() });

@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** The built-in template catalogue (metadata; the starter graph is applied on clone). */
  @Get()
  list() {
    return AGENT_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      type: t.type,
      languages: t.languages,
      persona: t.persona,
    }));
  }

  /** Clone a template into a new agent (persona + starter flow). Config writers only. */
  @Roles(...CONFIG_WRITERS)
  @Post(':id/clone')
  async clone(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = cloneSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('Invalid clone request');
    return this.templates.clone(ctx.tenantId, id, parsed.data.name);
  }
}
