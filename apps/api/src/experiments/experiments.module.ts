import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { ExperimentsController } from './experiments.controller';
import { ExperimentsService } from './experiments.service';

/** A/B experiments (Day 30): variants, traffic split, and significance results, RLS-scoped. */
@Module({
  imports: [DbModule],
  controllers: [ExperimentsController],
  providers: [ExperimentsService],
  exports: [ExperimentsService],
})
export class ExperimentsModule {}
