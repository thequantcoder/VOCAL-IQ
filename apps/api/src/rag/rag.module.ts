import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { PrismaService } from '../db/prisma.service';
import { RagController } from './rag.controller';
import { EMBEDDER, RAG_USAGE, RagService, openAiEmbedder, prismaUsageSink } from './rag.service';

/**
 * RAG knowledge (Day 20): pgvector ingestion + retrieval. The embedder + usage sink are
 * env/DB-backed here; both are injectable so the service is tested with a fake embedder.
 */
@Module({
  imports: [DbModule],
  controllers: [RagController],
  providers: [
    RagService,
    { provide: EMBEDDER, useFactory: () => openAiEmbedder(process.env.OPENAI_API_KEY ?? '') },
    {
      provide: RAG_USAGE,
      useFactory: (db: PrismaService) => prismaUsageSink(db),
      inject: [PrismaService],
    },
  ],
  exports: [RagService],
})
export class RagModule {}
