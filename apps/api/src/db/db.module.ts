import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global DB access — PrismaService (app + admin clients) available everywhere. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DbModule {}
