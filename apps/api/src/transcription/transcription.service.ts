import {
  type Citation,
  NotFoundError,
  type RetrievedChunkLike,
  type TranscriptSegment,
  buildCitations,
  cleanSegments,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/**
 * Advanced transcription controls (Day 39). Two RLS-scoped operations run at call finalize:
 *  - `applyNoVerbatim` — if the call's agent has no-verbatim on, store a filler-stripped
 *    `cleanSegments` copy alongside the always-kept raw `segments`.
 *  - `recordSources` — persist the RAG citations the agent used so the call detail can show
 *    "answered from: <source>" (trust / source attribution).
 * The pure text cleaning + citation building live in `@vocaliq/shared`; here we only read the
 * agent flag and persist through `withTenant`.
 */
export class TranscriptionService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Compute + store the clean transcript for a call when its agent has no-verbatim enabled.
   * Idempotent; returns the clean segments (or null when the agent keeps verbatim).
   */
  async applyNoVerbatim(tenantId: string, callId: string): Promise<TranscriptSegment[] | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const call = await tx.call.findFirst({
        where: { id: callId },
        select: {
          agent: { select: { noVerbatim: true } },
          transcript: { select: { id: true, segments: true } },
        },
      });
      if (!call?.transcript) throw new NotFoundError('Transcript not found');
      if (!call.agent?.noVerbatim) return null; // verbatim: leave the raw copy only

      const raw = Array.isArray(call.transcript.segments)
        ? (call.transcript.segments as TranscriptSegment[])
        : [];
      const clean = cleanSegments(raw);
      await tx.transcript.update({
        where: { id: call.transcript.id },
        data: { cleanSegments: clean as unknown as object },
      });
      return clean;
    });
  }

  /**
   * Record the KB chunks the agent used on a call as ranked citations on its transcript.
   * Best-effort de-dupe + snippet is done in `buildCitations`.
   */
  async recordSources(
    tenantId: string,
    callId: string,
    chunks: RetrievedChunkLike[],
    kbNameById: Record<string, string> = {},
  ): Promise<Citation[]> {
    const citations = buildCitations(chunks, kbNameById);
    await this.db.withTenant(tenantId, async (tx) => {
      const transcript = await tx.transcript.findFirst({
        where: { callId },
        select: { id: true },
      });
      if (!transcript) throw new NotFoundError('Transcript not found');
      await tx.transcript.update({
        where: { id: transcript.id },
        data: { sources: citations as unknown as object },
      });
    });
    return citations;
  }
}
