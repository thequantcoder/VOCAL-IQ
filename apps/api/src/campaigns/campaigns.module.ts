import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/** Campaign manager (Day 28): CRUD + CSV import + status + live monitor, RLS-scoped. */
@Module({
  imports: [DbModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
