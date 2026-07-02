import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

/** Lead workspace (Day 29): scored pipeline over contacts, RLS-scoped. */
@Module({
  imports: [DbModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
