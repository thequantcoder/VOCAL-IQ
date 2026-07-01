import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';

/** Builder flow persistence (Day 17): draft FlowVersion.graph read/autosave. */
@Module({
  imports: [DbModule],
  controllers: [FlowsController],
  providers: [FlowsService],
  exports: [FlowsService],
})
export class FlowsModule {}
