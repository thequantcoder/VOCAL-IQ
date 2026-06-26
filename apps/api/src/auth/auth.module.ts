import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';

/** Auth feature: Clerk token verification, /me, and the User-sync webhook. */
@Module({
  controllers: [AuthController],
  providers: [ClerkAuthGuard],
})
export class AuthModule {}
