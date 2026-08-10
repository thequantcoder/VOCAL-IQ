import {
  type ConsentInput,
  NotFoundError,
  type PiiKind,
  type RetentionPolicy,
  ValidationError,
  consentInputSchema,
  isExpired,
  phoneKey,
  redactSegments,
  requiresDisclosure,
  retentionPolicySchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Compliance engine (Day 60) — consent + recording disclosure, DNC suppression (global +
 * per-tenant), PII redaction of transcripts, per-tenant retention with auto-deletion, and the
 * PCI-safe rule that card data never reaches a store. All tenant reads/writes are RLS-scoped
 * (self-audit B). Pure logic (redaction, expiry, disclosure) lives in @vocaliq/shared.
 */

export interface SegmentLike {
  who: string;
  text: string;
}

export class ComplianceService {
  constructor(private readonly db: PrismaService) {}

  // ── Consent + disclosure ─────────────────────────────────────────────────────

  /** Record a consent/disclosure event for a contact. */
  async recordConsent(tenantId: string, input: unknown): Promise<{ id: string; granted: boolean }> {
    const parsed = consentInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid consent');
    const data: ConsentInput = parsed.data;
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.consentRecord.create({
        data: {
          tenantId,
          contactPhone: phoneKey(data.contactPhone),
          region: data.region.toUpperCase(),
          channel: data.channel,
          granted: data.granted,
          basis: data.basis ?? null,
        },
        select: { id: true, granted: true },
      }),
    );
    return row;
  }

  /**
   * Does the tenant hold valid consent to record/call this contact in `region`? Regions that don't
   * require disclosure are auto-satisfied; two-party regions need a stored `granted` consent.
   */
  async hasConsent(tenantId: string, contactPhone: string, region: string): Promise<boolean> {
    if (!requiresDisclosure(region)) return true;
    const latest = await this.db.withTenant(tenantId, (tx) =>
      tx.consentRecord.findFirst({
        where: { contactPhone: phoneKey(contactPhone) },
        orderBy: { ts: 'desc' },
        select: { granted: true },
      }),
    );
    return latest?.granted ?? false;
  }

  // ── DNC suppression ──────────────────────────────────────────────────────────

  /** Add a suppression. `global` (SUPER_ADMIN) writes a platform-wide entry (tenantId null). */
  async suppress(
    tenantId: string,
    phone: string,
    opts: { global?: boolean; reason?: string } = {},
  ): Promise<{ phone: string }> {
    const key = phoneKey(phone);
    const targetTenant = opts.global ? null : tenantId;
    // Everything runs under withTenant so RLS exposes the tenant's rows + global (null) rows; we
    // match the exact scope in JS (a null-in-WHERE filter is avoided for portability). Creating a
    // global row passes RLS WITH CHECK via its `tenantId IS NULL` branch.
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = await tx.suppression.findMany({
        where: { phone: key },
        select: { id: true, tenantId: true },
      });
      const match = rows.find((r) => r.tenantId === targetTenant);
      if (match) {
        await tx.suppression.update({
          where: { id: match.id },
          data: { reason: opts.reason ?? null },
        });
      } else {
        await tx.suppression.create({
          data: { tenantId: targetTenant, phone: key, reason: opts.reason ?? null },
        });
      }
      return { phone: key };
    });
  }

  async unsuppress(tenantId: string, phone: string, global = false): Promise<{ removed: boolean }> {
    const key = phoneKey(phone);
    const target = global ? null : tenantId;
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = await tx.suppression.findMany({
        where: { phone: key },
        select: { id: true, tenantId: true },
      });
      const ids = rows.filter((r) => r.tenantId === target).map((r) => r.id);
      if (!ids.length) return { removed: false };
      await tx.suppression.deleteMany({ where: { id: { in: ids } } });
      return { removed: true };
    });
  }

  /**
   * Is a number suppressed for this tenant (its own list OR a global entry)? Pre-call gate. Runs
   * under withTenant so RLS exposes both the tenant's rows and global (null-tenant) rows.
   */
  async isSuppressed(tenantId: string, phone: string): Promise<boolean> {
    const key = phoneKey(phone);
    const hit = await this.db.withTenant(tenantId, (tx) =>
      tx.suppression.findFirst({ where: { phone: key }, select: { id: true } }),
    );
    return hit !== null;
  }

  async listSuppressions(
    tenantId: string,
  ): Promise<{ phone: string; reason: string | null; global: boolean }[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.suppression.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { phone: true, reason: true, tenantId: true },
      }),
    );
    return rows.map((r) => ({ phone: r.phone, reason: r.reason, global: r.tenantId === null }));
  }

  // ── PII redaction ────────────────────────────────────────────────────────────

  /**
   * Redact PII from a call's transcript, persisting a clean copy (`cleanSegments`) + a redacted
   * flat `searchText` so FTS/embeddings never index raw PII. The raw `segments` are left intact
   * unless the tenant's retention policy says to redact them (handled by the sweep).
   */
  async redactTranscript(
    tenantId: string,
    callId: string,
    kinds?: PiiKind[],
  ): Promise<{ counts: Record<PiiKind, number> }> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.transcript.findFirst({ where: { callId }, select: { id: true, segments: true } }),
    );
    if (!t) throw new NotFoundError('Transcript not found');
    const segs = Array.isArray(t.segments) ? (t.segments as unknown as SegmentLike[]) : [];
    const { segments, counts } = redactSegments(segs, kinds);
    const searchText = segments.map((s) => s.text).join(' ');
    await this.db.withTenant(tenantId, (tx) =>
      tx.transcript.update({
        where: { id: t.id },
        data: { cleanSegments: segments as object, searchText },
      }),
    );
    return { counts };
  }

  // ── Retention ────────────────────────────────────────────────────────────────

  async getRetention(tenantId: string): Promise<RetentionPolicy> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const raw = (t?.settings as { retention?: unknown } | null)?.retention;
    const parsed = retentionPolicySchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : retentionPolicySchema.parse({});
  }

  async setRetention(tenantId: string, input: unknown): Promise<RetentionPolicy> {
    const policy = retentionPolicySchema.parse(input);
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), retention: policy };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return policy;
  }

  /**
   * Apply a tenant's retention policy at `now`: delete transcripts/recordings/memory older than
   * their window (0 = keep forever). Returns the counts removed. Idempotent + safe to run on a
   * schedule (worker). Recordings live on the Call (recordingUrl) — cleared, not row-deleted.
   */
  async sweepRetention(
    tenantId: string,
    now = new Date(),
  ): Promise<{ transcripts: number; recordings: number; memory: number }> {
    const policy = await this.getRetention(tenantId);
    let transcripts = 0;
    let recordings = 0;
    let memory = 0;

    if (policy.transcriptsDays > 0) {
      const rows = await this.db.withTenant(tenantId, (tx) =>
        tx.transcript.findMany({ select: { id: true, createdAt: true } }),
      );
      const expired = rows
        .filter((r) => isExpired(r.createdAt, policy.transcriptsDays, now))
        .map((r) => r.id);
      if (expired.length) {
        const res = await this.db.withTenant(tenantId, (tx) =>
          tx.transcript.deleteMany({ where: { id: { in: expired } } }),
        );
        transcripts = res.count;
      }
    }

    if (policy.recordingsDays > 0) {
      const calls = await this.db.withTenant(tenantId, (tx) =>
        tx.call.findMany({
          where: { recordingUrl: { not: null } },
          select: { id: true, createdAt: true },
        }),
      );
      const expired = calls
        .filter((c) => isExpired(c.createdAt, policy.recordingsDays, now))
        .map((c) => c.id);
      if (expired.length) {
        const res = await this.db.withTenant(tenantId, (tx) =>
          tx.call.updateMany({ where: { id: { in: expired } }, data: { recordingUrl: null } }),
        );
        recordings = res.count;
      }
    }

    if (policy.memoryDays > 0) {
      // AgentMemory tracks recency via updatedAt (no createdAt) — use it as the retention anchor.
      const mems = await this.db.withTenant(tenantId, (tx) =>
        tx.agentMemory.findMany({ select: { id: true, updatedAt: true } }),
      );
      const expired = mems
        .filter((m) => isExpired(m.updatedAt, policy.memoryDays, now))
        .map((m) => m.id);
      if (expired.length) {
        const res = await this.db.withTenant(tenantId, (tx) =>
          tx.agentMemory.deleteMany({ where: { id: { in: expired } } }),
        );
        memory = res.count;
      }
    }

    return { transcripts, recordings, memory };
  }
}
