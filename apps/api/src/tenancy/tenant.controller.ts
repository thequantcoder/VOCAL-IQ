import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role, ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import type { ClerkClaims } from '../auth/clerk';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../db/prisma.service';
import { CurrentMembership } from './current-tenant.decorator';
import { Roles } from './roles';
import { RolesGuard } from './roles.guard';
import type { TenantContext } from './tenant-context';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';

const auditBodySchema = z.object({ action: z.string().min(1).max(120) });

@Controller('tenants')
export class TenantController {
  constructor(
    private readonly db: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  /** The tenants the caller can switch between (auth only — inherently cross-tenant). */
  @UseGuards(ClerkAuthGuard)
  @Get('memberships')
  async memberships(@CurrentUser() claims: ClerkClaims) {
    const user = await this.tenants.ensureLocalUser(claims);
    return { memberships: await this.tenants.listMemberships(user.id) };
  }

  /** The active tenant — read via the RLS app client, proving end-to-end scoping. */
  @UseGuards(ClerkAuthGuard, TenantGuard)
  @Get('current')
  async current(@CurrentMembership() ctx: TenantContext) {
    const tenant = await this.db.withTenant(ctx.tenantId, (tx) =>
      tx.tenant.findFirstOrThrow({
        where: { id: ctx.tenantId },
        select: { id: true, name: true, type: true, slug: true },
      }),
    );
    return { ...tenant, role: ctx.role };
  }

  /** A role-gated mutation: ANALYST/AGENT are blocked; config writers may act. */
  @UseGuards(ClerkAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.RESELLER_ADMIN)
  @Post('current/audit')
  async writeAudit(@CurrentMembership() ctx: TenantContext, @Body() body: unknown) {
    const parsed = auditBodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('action is required (1–120 chars)');

    const entry = await this.db.withTenant(ctx.tenantId, (tx) =>
      tx.auditLog.create({
        data: { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: parsed.data.action },
        select: { id: true, action: true, ts: true },
      }),
    );
    return entry;
  }
}
