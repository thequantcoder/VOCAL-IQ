import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AuthController } from './auth.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';

/** Auth feature: Clerk token verification, /me, and the User-sync webhook. */
@Module({
  imports: [TenancyModule], // for TenantService (memberships on /me + lazy user sync)
  controllers: [AuthController],
  providers: [ClerkAuthGuard],
})
export class AuthModule {}
