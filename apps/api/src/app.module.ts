import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

/** Root module. Feature modules (auth, tenancy, agents, …) are added per the build sequence. */
@Module({
  imports: [AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
