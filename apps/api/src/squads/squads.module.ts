import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { SquadsController } from './squads.controller';
import { SquadsService } from './squads.service';

/** Multi-agent Squads (Day 27): CRUD for squads + members + handoff rules, RLS-scoped. */
@Module({
  imports: [DbModule],
  controllers: [SquadsController],
  providers: [SquadsService],
  exports: [SquadsService],
})
export class SquadsModule {}
