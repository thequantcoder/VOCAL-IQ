import {
  CallChannel,
  type CallChannel as CallChannelT,
  CallDirection,
  type CallDirection as CallDirectionT,
  CallStatus,
  type CallStatus as CallStatusT,
  NotFoundError,
  ValidationError,
} from '@vocaliq/shared';
import { z } from 'zod';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface CallListItem {
  id: string;
  direction: CallDirectionT;
  channel: CallChannelT;
  status: CallStatusT;
  disposition: string | null;
  durationSec: number | null;
  costBreakdown: unknown;
  createdAt: Date;
  agent: { id: string; name: string };
}

export interface CallDetail {
  id: string;
  direction: CallDirectionT;
  channel: CallChannelT;
  status: CallStatusT;
  disposition: string | null;
  sentiment: number | null;
  durationSec: number | null;
  recordingUrl: string | null;
  costBreakdown: unknown;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  agent: { id: string; name: string };
  transcript: {
    segments: unknown;
    cleanSegments: unknown;
    sources: unknown;
    summary: string | null;
    keywords: string[];
    topics: string[];
    entities: unknown;
    sentiment: string | null;
    intelAt: Date | null;
  } | null;
}

/**
 * Read side of Calls for the dashboard (Day 14): a cursor-paginated list + a per-call
 * detail (with transcript). RLS-scoped so a tenant only sees its own calls.
 */

export const callsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
  status: z
    .enum([
      CallStatus.QUEUED,
      CallStatus.RINGING,
      CallStatus.IN_PROGRESS,
      CallStatus.COMPLETED,
      CallStatus.FAILED,
      CallStatus.VOICEMAIL,
      CallStatus.NO_ANSWER,
    ])
    .optional(),
  direction: z.enum([CallDirection.INBOUND, CallDirection.OUTBOUND]).optional(),
  channel: z
    .enum([CallChannel.PSTN, CallChannel.WEB, CallChannel.SIP, CallChannel.WHATSAPP])
    .optional(),
  agentId: z.string().uuid().optional(),
});

const LIST_SELECT = {
  id: true,
  direction: true,
  channel: true,
  status: true,
  disposition: true,
  durationSec: true,
  costBreakdown: true,
  createdAt: true,
  agent: { select: { id: true, name: true } },
} as const;

export class CallsReadService {
  constructor(private readonly db: PrismaService) {}

  /** Cursor-paginated call list (newest first). Returns `nextCursor` when more remain. */
  async list(
    tenantId: string,
    query: unknown,
  ): Promise<{ items: CallListItem[]; nextCursor: string | null }> {
    const parsed = callsQuerySchema.safeParse(query);
    if (!parsed.success) throw new ValidationError('Invalid call filters');
    const { limit, cursor, status, direction, channel, agentId } = parsed.data;

    const where = {
      ...(status ? { status } : {}),
      ...(direction ? { direction } : {}),
      ...(channel ? { channel } : {}),
      ...(agentId ? { agentId } : {}),
    };

    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.call.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // fetch one extra to detect a next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  /** Full call detail + transcript for the call-detail view. */
  async detail(tenantId: string, id: string): Promise<CallDetail> {
    const call = await this.db.withTenant(tenantId, (tx) =>
      tx.call.findFirst({
        where: { id },
        select: {
          id: true,
          direction: true,
          channel: true,
          status: true,
          disposition: true,
          sentiment: true,
          durationSec: true,
          recordingUrl: true,
          costBreakdown: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
          agent: { select: { id: true, name: true } },
          transcript: {
            select: {
              segments: true,
              cleanSegments: true,
              sources: true,
              summary: true,
              keywords: true,
              topics: true,
              entities: true,
              sentiment: true,
              intelAt: true,
            },
          },
        },
      }),
    );
    if (!call) throw new NotFoundError('Call not found');
    return call;
  }
}
