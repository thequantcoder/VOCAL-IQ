import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { FlowsModule } from '../flows/flows.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

/** Agent templates (Day 24): list built-ins + clone-to-agent (persona + starter flow). */
@Module({
  imports: [AgentsModule, FlowsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
