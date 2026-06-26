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
import { clerkClient } from './clerk';
import type { ClerkClaims } from './clerk';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { type ClerkUserData, syncUser } from './user-sync';
import { type SvixHeaders, verifyClerkWebhook } from './webhook';

/** What `/me` returns — the verified identity (memberships arrive with RBAC, Day 5). */
interface MeResponse {
  userId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  memberships: never[];
}

@Controller('auth')
export class AuthController {
  /** Current authenticated user — guarded; reads verified claims, enriches from Clerk. */
  @UseGuards(ClerkAuthGuard)
  @Get('me')
  async me(@CurrentUser() claims: ClerkClaims): Promise<MeResponse> {
    const user = await clerkClient().users.getUser(claims.userId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return {
      userId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      name: name.length > 0 ? name : null,
      imageUrl: user.imageUrl ?? null,
      memberships: [],
    };
  }

  /**
   * Clerk webhook for User sync. Public route, but trusted only after Svix
   * signature verification over the RAW body (never the parsed JSON).
   */
  @Post('clerk/webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: SvixHeaders,
  ): Promise<{ received: true }> {
    const raw = req.rawBody?.toString('utf8') ?? '';
    const event = verifyClerkWebhook(process.env.CLERK_WEBHOOK_SECRET, raw, headers);
    if (event.type === 'user.created' || event.type === 'user.updated') {
      await syncUser(event.data as unknown as ClerkUserData);
    }
    return { received: true };
  }
}
