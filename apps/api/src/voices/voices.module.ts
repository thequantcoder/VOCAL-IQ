import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { VoicesController } from './voices.controller';
import { VOICE_CLONER, VoicesService, elevenLabsCloner } from './voices.service';

/**
 * Voice library + gated cloning (Day 26). The cloner is injectable so the service is
 * unit-tested with a fake (no live ElevenLabs call in CI); the live ElevenLabs cloner is
 * wired here from the env key.
 */
@Module({
  imports: [DbModule],
  controllers: [VoicesController],
  providers: [
    VoicesService,
    {
      provide: VOICE_CLONER,
      useFactory: () => elevenLabsCloner(process.env.ELEVENLABS_API_KEY ?? ''),
    },
  ],
  exports: [VoicesService],
})
export class VoicesModule {}
