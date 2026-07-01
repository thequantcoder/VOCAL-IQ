import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';

/** Public web-call widget (Day 16): tenant-scoped, rate-limited browser sessions. */
@Module({
  imports: [DbModule],
  controllers: [WidgetController],
  providers: [WidgetService],
})
export class WidgetModule {}
