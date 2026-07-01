import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';

/** Cost attribution (Day 13): per-call breakdowns, rollups, reconciliation. */
@Module({
  imports: [DbModule],
  controllers: [CostController],
  providers: [CostService],
  exports: [CostService],
})
export class CostModule {}
