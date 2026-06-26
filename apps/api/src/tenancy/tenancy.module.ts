import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RolesGuard } from './roles.guard';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';

/** Tenancy + RBAC: resolve the active tenant, enforce roles, scope data via RLS. */
@Module({
  controllers: [TenantController],
  // ClerkAuthGuard is stateless; provided here so this module's routes can use it
  // without importing AuthModule (avoids a module cycle).
  providers: [TenantService, TenantGuard, RolesGuard, ClerkAuthGuard],
  exports: [TenantService, TenantGuard, RolesGuard],
})
export class TenancyModule {}
