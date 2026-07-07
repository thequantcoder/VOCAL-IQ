import {
  CALL_EXPORT_HEADERS,
  type ExportCadence,
  type ExportKind,
  MAX_EXPORT_ROWS,
  NotFoundError,
  USAGE_EXPORT_HEADERS,
  ValidationError,
  callCells,
  exportInputSchema,
  scheduleInputSchema,
  toCsv,
  usageCells,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { AnalyticsApiService } from './analytics-api.service';

/**
 * BI export generation (Day 87). Materializes a tenant's calls/usage over a window as a CSV (bounded to
 * {@link MAX_EXPORT_ROWS}) and stores it as an {@link AnalyticsExport} the tenant can download or a
 * warehouse can pull; a tenant also configures {@link ExportSchedule}s that the worker runs each cadence.
 * Every generation is RLS-scoped (`db.withTenant`); PII is masked unless the caller holds `pii:read`
 * (governance, self-audit C); the CSV writer is formula-injection-safe (in @vocaliq/shared). Export
 * creation is audited.
 */

const EXPORT_SELECT = {
  id: true,
  kind: true,
  format: true,
  status: true,
  rowCount: true,
  fromTs: true,
  toTs: true,
  error: true,
  createdAt: true,
} as const;

const SCHEDULE_SELECT = {
  id: true,
  kind: true,
  cadence: true,
  active: true,
  lastRunAt: true,
  createdAt: true,
} as const;

export class AnalyticsExportService {
  constructor(
    private readonly db: PrismaService,
    private readonly analytics: AnalyticsApiService,
  ) {}

  // ── on-demand exports ───────────────────────────────────────────────────────

  /**
   * Generate a CSV export of `kind` over the window and store it (RLS-scoped). Stored exports are
   * ALWAYS PII-masked — raw PII must never sit in a downloadable artifact (a stored file could be read
   * by an under-privileged member); un-masked PII is available ONLY via the live `/v1/analytics` API
   * with the `pii:read` scope (streamed, never persisted). Self-audit C.
   */
  async create(tenantId: string, input: unknown) {
    const parsed = exportInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid export request');
    const { kind, from, to } = parsed.data;

    const window = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
    const built = await this.buildCsv(tenantId, kind, window, false);

    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.analyticsExport.create({
        data: {
          tenantId,
          kind,
          format: 'csv',
          status: 'ready',
          rowCount: built.rowCount,
          ...(from ? { fromTs: from } : {}),
          ...(to ? { toTs: to } : {}),
          content: built.csv,
        },
        select: EXPORT_SELECT,
      }),
    );
    // Audit the export (who exported what) — self-audit C.
    await this.db.withTenant(tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          action: 'analytics.export',
          target: kind,
          meta: { exportId: row.id, rowCount: built.rowCount } as object,
        },
      }),
    );
    return row;
  }

  /** Build the CSV for a kind + window using the RLS-scoped read layer (identical to the API rows). */
  private async buildCsv(
    tenantId: string,
    kind: ExportKind,
    window: { from?: Date; to?: Date },
    includePii: boolean,
  ): Promise<{ csv: string; rowCount: number }> {
    if (kind === 'usage') {
      const rows = await this.analytics.usage(tenantId, window);
      return { csv: toCsv([...USAGE_EXPORT_HEADERS], rows.map(usageCells)), rowCount: rows.length };
    }
    // calls
    const page = await this.analytics.listCalls(
      tenantId,
      {
        ...(window.from ? { from: window.from } : {}),
        ...(window.to ? { to: window.to } : {}),
        limit: MAX_EXPORT_ROWS,
      },
      { includePii },
    );
    return {
      csv: toCsv([...CALL_EXPORT_HEADERS], page.rows.map(callCells)),
      rowCount: page.rows.length,
    };
  }

  async list(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.analyticsExport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: EXPORT_SELECT,
      }),
    );
  }

  /** The CSV body of an export (RLS-scoped — a foreign export id yields NotFound). */
  async download(tenantId: string, id: string): Promise<{ filename: string; csv: string }> {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.analyticsExport.findFirst({
        where: { id },
        select: { kind: true, content: true, createdAt: true },
      }),
    );
    if (!row) throw new NotFoundError('Export not found');
    const day = row.createdAt.toISOString().slice(0, 10);
    return { filename: `vocaliq-${row.kind}-${day}.csv`, csv: row.content ?? '' };
  }

  // ── schedules ────────────────────────────────────────────────────────────────

  async listSchedules(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.exportSchedule.findMany({ orderBy: { createdAt: 'desc' }, select: SCHEDULE_SELECT }),
    );
  }

  async createSchedule(tenantId: string, input: unknown) {
    const parsed = scheduleInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid schedule');
    return this.db.withTenant(tenantId, (tx) =>
      tx.exportSchedule.create({
        data: {
          tenantId,
          kind: parsed.data.kind as ExportKind,
          cadence: parsed.data.cadence as ExportCadence,
          active: parsed.data.active,
        },
        select: SCHEDULE_SELECT,
      }),
    );
  }

  async setScheduleActive(tenantId: string, id: string, active: boolean) {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.exportSchedule.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Schedule not found');
    return this.db.withTenant(tenantId, (tx) =>
      tx.exportSchedule.update({ where: { id }, data: { active }, select: SCHEDULE_SELECT }),
    );
  }

  async removeSchedule(tenantId: string, id: string) {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.exportSchedule.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Schedule not found');
    await this.db.withTenant(tenantId, (tx) => tx.exportSchedule.delete({ where: { id } }));
    return { id };
  }
}
