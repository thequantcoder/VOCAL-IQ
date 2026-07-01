import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { PrismaService } from '../db/prisma.service';
import { CurrentMembership } from '../tenancy/current-tenant.decorator';
import { CONFIG_WRITERS, Roles } from '../tenancy/roles';
import { RolesGuard } from '../tenancy/roles.guard';
import type { TenantContext } from '../tenancy/tenant-context';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RagService } from './rag.service';

const createKbSchema = z.object({
  name: z.string().min(1).max(120),
  agentId: z.string().uuid().optional(),
});
const ingestSchema = z.object({ text: z.string().min(1).max(200_000) });
const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(20).optional(),
});

@UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
@Controller('kb')
export class RagController {
  constructor(
    private readonly rag: RagService,
    private readonly db: PrismaService,
  ) {}

  /** List the tenant's knowledge bases (any member — RLS-scoped). */
  @Get()
  async list(@CurrentMembership() ctx: TenantContext) {
    return this.db.withTenant(ctx.tenantId, (tx) =>
      tx.knowledgeBase.findMany({
        select: { id: true, name: true, sourceType: true, agentId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  @Roles(...CONFIG_WRITERS)
  @Post()
  async create(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    const parsed = createKbSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Knowledge base name is required');
    return this.rag.createKb(ctx.tenantId, {
      name: parsed.data.name,
      ...(parsed.data.agentId ? { agentId: parsed.data.agentId } : {}),
    });
  }

  /** Ingest raw text into a KB (chunk → embed → store). File/URL parsing = follow-up. */
  @Roles(...CONFIG_WRITERS)
  @Post(':id/ingest')
  async ingest(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('text is required');
    return this.rag.ingestText(ctx.tenantId, id, parsed.data.text);
  }

  /** Preview retrieval for a KB (any member). The Knowledge node uses this at call time. */
  @Post(':id/search')
  async search(
    @CurrentMembership() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = searchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('query is required');
    return this.rag.retrieve(ctx.tenantId, id, parsed.data.query, parsed.data.k ?? 4);
  }
}
