import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** Root module. Feature modules (auth, tenancy, agents, …) are added per the build sequence. */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
