import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { CallsReadService } from './calls-read.service';
import { CallsController } from './calls.controller';
import { DIALER, PendingDialer } from './dialer';
import { OutboundService } from './outbound.service';

/**
 * Outbound calling (Day 10). The Dialer is bound to PendingDialer until the voice-service
 * dial endpoint + a funded Twilio number are live (memory: twilio-live-test-pending),
 * then swapped for the HTTP dialer — no change to the service or controller.
 */
@Module({
  imports: [DbModule],
  controllers: [CallsController],
  providers: [OutboundService, CallsReadService, { provide: DIALER, useClass: PendingDialer }],
  exports: [OutboundService, CallsReadService],
})
export class CallsModule {}
