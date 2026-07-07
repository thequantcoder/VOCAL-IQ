import { z } from 'zod';

/**
 * Voice analytics API + BI exports (Day 87) — the pure domain shared across api/web/workers.
 *
 * Enterprises pull call/usage analytics via the scoped public API and via scheduled CSV exports into
 * their own BI. Everything HERE is pure + deterministic — CSV serialization (injection-safe), PII
 * masking, the schedule-due check, and the request schemas — so it unit-tests without a DB. Two
 * properties matter most:
 *  - C (governance, self-audit C): reads are scope-gated (analytics:read) and raw PII (phone/email) is
 *    MASKED unless the key also holds pii:read ({@link maskPhone}, {@link maskEmail}); the CSV writer
 *    neutralizes formula-injection ({@link toCsv}) so an exported cell can't execute in a spreadsheet.
 *  - B (isolation): every read/export is tenant-scoped in the service (RLS); the pure layer never sees
 *    another tenant's data.
 */

// ── Export kinds + cadences ─────────────────────────────────────────────────────

export const EXPORT_KINDS = ['calls', 'usage'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_CADENCES = ['daily', 'weekly'] as const;
export type ExportCadence = (typeof EXPORT_CADENCES)[number];

// ── CSV serialization (injection-safe — self-audit C) ──────────────────────────

/**
 * Serialize one CSV cell. Two defences:
 *  1. RFC-4180 quoting: a value containing a comma, quote, or newline is wrapped in quotes with inner
 *     quotes doubled.
 *  2. Formula-injection guard: a value starting with `= + - @` (or a control char a spreadsheet may
 *     treat as a formula lead) is prefixed with a single quote so Excel/Sheets treat it as text — an
 *     exported cell can never execute (self-audit C).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialize a table (header row + data rows) to a CSV string. Pure. */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const head = headers.map(csvCell).join(',');
  const body = rows.map((r) => r.map(csvCell).join(','));
  return [head, ...body].join('\n');
}

// ── PII masking (self-audit C) ──────────────────────────────────────────────────

/** Mask a phone/E.164 to its first + last 2 chars (e.g. `+1••••••7654`). Empty in → empty out. */
export function maskPhone(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.length === 0) return '';
  if (s.length <= 4) return '•'.repeat(s.length);
  return s.slice(0, 2) + '•'.repeat(s.length - 4) + s.slice(-2);
}

/** Mask an email to its first char + domain (e.g. `j•••@acme.com`). Non-emails fall back to phone mask. */
export function maskEmail(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const at = s.indexOf('@');
  if (at <= 0) return maskPhone(s);
  return `${s[0]}•••${s.slice(at)}`;
}

// ── Schedule cadence (self-audit F — bounded, deterministic) ────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Is a schedule due to run? Never run → due; otherwise due once the cadence interval has elapsed. Pure. */
export function isScheduleDue(
  cadence: ExportCadence,
  lastRunAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!lastRunAt) return true;
  const interval = cadence === 'daily' ? DAY_MS : 7 * DAY_MS;
  return now.getTime() - lastRunAt.getTime() >= interval;
}

// ── Request schemas ──────────────────────────────────────────────────────────────

/** Query for the analytics read API — filtered + cursor-paginated (createdAt cursor). */
export const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  agentId: z.string().uuid().optional(),
  status: z.string().max(40).optional(),
  disposition: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  /** Opaque keyset cursor = `<last row createdAt ISO>|<last row id>` (composite — no row loss on ties). */
  cursor: z.string().max(80).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const exportInputSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.literal('csv').default('csv'),
});
export type ExportInput = z.infer<typeof exportInputSchema>;

export const scheduleInputSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  cadence: z.enum(EXPORT_CADENCES),
  active: z.boolean().default(true),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

/** Max rows a single export materializes (keeps an export bounded + the CSV a sane size). */
export const MAX_EXPORT_ROWS = 50_000;

// ── CSV column contracts (shared by the API + the scheduled worker so exports are identical) ──

/** A governed call row (the `phone` is ALREADY masked/unmasked by the read layer — self-audit C). */
export interface GovernedCallRow {
  id: string;
  agentId: string;
  phone: string;
  direction: string;
  status: string;
  disposition: string | null;
  sentiment: number | null;
  durationSec: number | null;
  costUsd: number;
  startedAt: string | null;
  createdAt: string;
}

export const CALL_EXPORT_HEADERS = [
  'id',
  'agentId',
  'phone',
  'direction',
  'status',
  'disposition',
  'sentiment',
  'durationSec',
  'costUsd',
  'startedAt',
  'createdAt',
] as const;

export function callCells(r: GovernedCallRow): unknown[] {
  return [
    r.id,
    r.agentId,
    r.phone,
    r.direction,
    r.status,
    r.disposition ?? '',
    r.sentiment ?? '',
    r.durationSec ?? '',
    r.costUsd,
    r.startedAt ?? '',
    r.createdAt,
  ];
}

export interface UsageExportRow {
  day: string;
  provider: string;
  capability: string;
  costUsd: number;
  units: number;
}
export const USAGE_EXPORT_HEADERS = ['day', 'provider', 'capability', 'costUsd', 'units'] as const;
export function usageCells(r: UsageExportRow): unknown[] {
  return [r.day, r.provider, r.capability, r.costUsd, r.units];
}
