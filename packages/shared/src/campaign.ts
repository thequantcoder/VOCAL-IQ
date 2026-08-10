import { z } from 'zod';

/**
 * Campaign manager pure logic (Day 28): CSV import + dedupe + DNC suppression, timezone-
 * aware calling windows, a retry state machine, and pacing/concurrency selection. These
 * are the safety-critical, deterministic units the API + scheduler worker consume — kept
 * pure so DNC/caps/pacing (self-audit C + F) are exhaustively unit-tested without a live
 * dialer. Nothing here dials; it only decides WHO is due and WHEN.
 */

// ── Phone normalisation ─────────────────────────────────────────────────────────

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Normalise a raw phone to E.164, or null if it can't be. Strips spaces/dashes/parens; a
 * leading `00` becomes `+`; a bare number keeps a leading `+` if present. We do NOT guess
 * a country code — ambiguous inputs are rejected so we never dial the wrong number.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let s = trimmed.replace(/[\s()\-.]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  // Only auto-prefix a bare number if it's long enough to already carry a country code
  // (≥10 digits). Shorter local numbers are ambiguous → rejected (never dial a guess).
  if (!s.startsWith('+') && /^\d{10,15}$/.test(s)) s = `+${s}`;
  return E164.test(s) ? s : null;
}

// ── CSV import ────────────────────────────────────────────────────────────────

export interface ImportedContact {
  phone: string;
  name?: string;
  email?: string;
  fields: Record<string, string>;
}

export interface ImportResult {
  contacts: ImportedContact[];
  invalid: number; // rows with no usable phone
  duplicates: number; // dropped as same-phone duplicates
  suppressed: number; // dropped by DNC
}

/** Parse a CSV/TSV string into header + rows (handles quoted fields + commas within). */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const header = parseLine(lines[0] as string).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(parseLine);
  return { header, rows };
}

/**
 * Map parsed rows to contacts using a header→field mapping, then dedupe by phone and
 * suppress DNC numbers. Rows with no valid phone are counted `invalid`. The full pipeline
 * a campaign import runs — every drop is counted so the UI can report it (no silent loss).
 */
export function importContacts(
  text: string,
  mapping: { phone: string; name?: string; email?: string },
  dncPhones: Set<string> = new Set(),
): ImportResult {
  const { header, rows } = parseCsv(text);
  const idx = (col?: string) => (col ? header.indexOf(col.toLowerCase()) : -1);
  const phoneI = idx(mapping.phone);
  const nameI = idx(mapping.name);
  const emailI = idx(mapping.email);

  let invalid = 0;
  let duplicates = 0;
  let suppressed = 0;
  const seen = new Set<string>();
  const contacts: ImportedContact[] = [];

  for (const row of rows) {
    const phone = phoneI >= 0 ? normalizePhone(row[phoneI] ?? '') : null;
    if (!phone) {
      invalid++;
      continue;
    }
    if (dncPhones.has(phone)) {
      suppressed++;
      continue;
    }
    if (seen.has(phone)) {
      duplicates++;
      continue;
    }
    seen.add(phone);
    const fields: Record<string, string> = {};
    header.forEach((h, i) => {
      if (i !== phoneI && i !== nameI && i !== emailI && row[i]) fields[h] = row[i] as string;
    });
    contacts.push({
      phone,
      ...(nameI >= 0 && row[nameI] ? { name: row[nameI] } : {}),
      ...(emailI >= 0 && row[emailI] ? { email: row[emailI] } : {}),
      fields,
    });
  }
  return { contacts, invalid, duplicates, suppressed };
}

// ── Timezone-aware calling window ───────────────────────────────────────────────

export const callWindowSchema = z.object({
  timezone: z.string().min(1).default('UTC'), // IANA tz, e.g. America/New_York
  days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]), // 0=Sun..6=Sat
  startMinute: z
    .number()
    .int()
    .min(0)
    .max(1439)
    .default(9 * 60), // 09:00 local
  endMinute: z
    .number()
    .int()
    .min(0)
    .max(1439)
    .default(20 * 60), // 20:00 local
});
export type CallWindow = z.infer<typeof callWindowSchema>;

/** Local weekday (0=Sun) + minute-of-day for `at` in `timezone`, via Intl (no deps). */
export function localMoment(at: Date, timezone: string): { weekday: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const min = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { weekday: weekdayMap[wd] ?? 0, minute: hour * 60 + min };
}

/** True if `at` falls inside the campaign's local calling window (day + time-of-day). */
export function isWithinWindow(at: Date, window: CallWindow): boolean {
  const { weekday, minute } = localMoment(at, window.timezone);
  if (!window.days.includes(weekday)) return false;
  return minute >= window.startMinute && minute < window.endMinute;
}

// ── Retry state machine ─────────────────────────────────────────────────────────

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  backoffMinutes: z.array(z.number().int().min(0)).default([60, 240, 1440]), // per-attempt wait
  retryOn: z.array(z.string()).default(['NO_ANSWER', 'BUSY', 'FAILED', 'VOICEMAIL']),
});
export type RetryPolicy = z.infer<typeof retryPolicySchema>;

export type RetryDecision =
  | { action: 'retry'; retryAt: Date; attempt: number }
  | { action: 'done'; reason: 'max_attempts' | 'terminal_disposition' | 'success' };

/**
 * Decide the next step after a call attempt. `attempts` is the count INCLUDING the one
 * that just finished. Retries only on retryable dispositions, backs off per the policy
 * (last backoff repeats if attempts exceed the list), and stops at maxAttempts.
 */
export function nextRetry(
  attempts: number,
  disposition: string,
  policy: RetryPolicy,
  now: Date,
): RetryDecision {
  const terminalSuccess = ['COMPLETED', 'ANSWERED', 'CONNECTED'];
  if (terminalSuccess.includes(disposition)) return { action: 'done', reason: 'success' };
  if (!policy.retryOn.includes(disposition)) {
    return { action: 'done', reason: 'terminal_disposition' };
  }
  if (attempts >= policy.maxAttempts) return { action: 'done', reason: 'max_attempts' };
  const backoffIdx = Math.min(attempts - 1, policy.backoffMinutes.length - 1);
  const waitMin = policy.backoffMinutes[Math.max(0, backoffIdx)] ?? 60;
  return {
    action: 'retry',
    attempt: attempts + 1,
    retryAt: new Date(now.getTime() + waitMin * 60_000),
  };
}

// ── Pacing / concurrency selection ──────────────────────────────────────────────

export interface DueContact {
  id: string;
  nextAttemptAt: Date | null; // null = never attempted / due now
}

export interface PacingState {
  now: Date;
  inFlight: number; // calls currently non-terminal for this campaign
  concurrency: number; // max simultaneous calls
  pacePerTick: number; // max new calls to launch this tick
}

/**
 * Select which pending contacts to dial this tick, honouring BOTH the concurrency cap and
 * the per-tick pace. Only contacts whose `nextAttemptAt` has arrived are eligible (respects
 * retry backoff). Returns ids in due order — the caller enqueues exactly these. This is the
 * abuse/cost guard: it can never exceed the caps regardless of backlog size (self-audit C+F).
 */
export function selectDueContacts(contacts: DueContact[], state: PacingState): string[] {
  const capacity = Math.max(0, state.concurrency - state.inFlight);
  const budget = Math.max(0, Math.min(capacity, state.pacePerTick));
  if (budget === 0) return [];
  const due = contacts
    .filter((c) => c.nextAttemptAt === null || c.nextAttemptAt.getTime() <= state.now.getTime())
    .sort((a, b) => {
      const at = a.nextAttemptAt?.getTime() ?? 0;
      const bt = b.nextAttemptAt?.getTime() ?? 0;
      return at - bt;
    });
  return due.slice(0, budget).map((c) => c.id);
}

// ── Status constants ────────────────────────────────────────────────────────────

export const CampaignStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const CampaignContactStatus = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  CALLING: 'CALLING',
  RETRY: 'RETRY',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SUPPRESSED: 'SUPPRESSED',
} as const;
export type CampaignContactStatus =
  (typeof CampaignContactStatus)[keyof typeof CampaignContactStatus];
