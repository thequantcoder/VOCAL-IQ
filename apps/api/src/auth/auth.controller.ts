import {
  Controller,
  Get,
  Headers,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../db/prisma.service';
import { TenantService } from '../tenancy/tenant.service';
import { clerkClient } from './clerk';
import type { ClerkClaims } from './clerk';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { type ClerkUserData, upsertUserFromClerk } from './user-sync';
import { type SvixHeaders, verifyClerkWebhook } from './webhook';

interface MeResponse {
  userId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  memberships: { tenantId: string; role: string; status: string }[];
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  /** Current authenticated user — verified claims enriched from Clerk + local memberships. */
  @UseGuards(ClerkAuthGuard)
  @Get('me')
  async me(@CurrentUser() claims: ClerkClaims): Promise<MeResponse> {
    const user = await clerkClient().users.getUser(claims.userId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const localUser = await this.tenants.ensureLocalUser(claims);
    return {
      userId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      name: name.length > 0 ? name : null,
      imageUrl: user.imageUrl ?? null,
      memberships: await this.tenants.listMemberships(localUser.id),
    };
  }

  /**
   * Clerk webhook for User sync. Public route, but trusted only after Svix
   * signature verification over the RAW body (never the parsed JSON). Upserts the
   * local User on the owner client (User has no RLS; sync is auth-infra).
   */
  @Post('clerk/webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: SvixHeaders,
  ): Promise<{ received: true }> {
    const raw = req.rawBody?.toString('utf8') ?? '';
    const event = verifyClerkWebhook(process.env.CLERK_WEBHOOK_SECRET, raw, headers);
    if (event.type === 'user.created' || event.type === 'user.updated') {
      await upsertUserFromClerk(this.db.admin, event.data as unknown as ClerkUserData);
    }
    return { received: true };
  }
}
