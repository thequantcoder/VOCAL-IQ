import { z } from 'zod';

/**
 * Compliance primitives (Day 60) — pure PII detection/redaction, consent-region rules, DNC phone
 * normalization, and retention math shared across api/web/voice. Keeping these pure makes the
 * regulated-vertical behaviour (redaction effectiveness, retention expiry, disclosure gating)
 * exhaustively unit-testable and identical everywhere. No PII is ever logged.
 */

// ── PII detection + redaction ────────────────────────────────────────────────

export type PiiKind = 'email' | 'phone' | 'ssn' | 'card' | 'ipv4';

interface PiiRule {
  kind: PiiKind;
  re: RegExp;
  /** Extra validation (e.g. Luhn for cards) to cut false positives. */
  valid?: (m: string) => boolean;
}

const PII_RULES: PiiRule[] = [
  { kind: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // 13–19 digit card numbers (optional spaces/dashes), Luhn-checked.
  { kind: 'card', re: /\b(?:\d[ -]?){13,19}\b/g, valid: luhnValid },
  { kind: 'phone', re: /(?:\+?\d[\d\s().-]{7,}\d)/g, valid: (m) => digits(m).length >= 10 },
  { kind: 'ipv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
];

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

/** Luhn checksum — validates card numbers to avoid redacting arbitrary long digit runs. */
export function luhnValid(input: string): boolean {
  const d = digits(input);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export interface RedactionResult {
  text: string;
  counts: Record<PiiKind, number>;
}

/**
 * Redact PII from free text. Cards are checked FIRST (most sensitive, PCI) so a card-shaped run
 * isn't consumed by the phone rule. Each hit is replaced with a `[REDACTED:kind]` token. Returns
 * the redacted text + per-kind counts (for audit without exposing the values).
 */
export function redactPii(
  text: string,
  kinds: PiiKind[] = ['card', 'ssn', 'email', 'phone'],
): RedactionResult {
  const counts: Record<PiiKind, number> = { email: 0, phone: 0, ssn: 0, card: 0, ipv4: 0 };
  let out = text;
  // Order rules by the caller's priority; cards before phones by default.
  const rules = PII_RULES.filter((r) => kinds.includes(r.kind)).sort(
    (a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind),
  );
  for (const rule of rules) {
    out = out.replace(rule.re, (m) => {
      if (rule.valid && !rule.valid(m)) return m;
      counts[rule.kind]++;
      return `[REDACTED:${rule.kind}]`;
    });
  }
  return { text: out, counts };
}

/** Redact PII across transcript segments (each `{ text }`), summing counts. */
export function redactSegments<T extends { text: string }>(
  segments: T[],
  kinds?: PiiKind[],
): { segments: T[]; counts: Record<PiiKind, number> } {
  const total: Record<PiiKind, number> = { email: 0, phone: 0, ssn: 0, card: 0, ipv4: 0 };
  const out = segments.map((s) => {
    const r = redactPii(s.text, kinds);
    for (const k of Object.keys(r.counts) as PiiKind[]) total[k] += r.counts[k];
    return { ...s, text: r.text };
  });
  return { segments: out, counts: total };
}

/** Strip ONLY card data (PCI-safe capture): card numbers never reach a transcript/recording store. */
export function stripCardData(text: string): string {
  return redactPii(text, ['card']).text;
}

// ── Consent + recording disclosure (region-aware) ────────────────────────────

/** Two-party-consent regions require an explicit recording disclosure before capture. */
export const TWO_PARTY_REGIONS = ['US-CA', 'US-FL', 'US-IL', 'US-PA', 'US-WA', 'EU', 'GB'] as const;
export type ConsentRegion = string;

/** Does this region require an explicit recording disclosure/consent? */
export function requiresDisclosure(region: ConsentRegion): boolean {
  return (TWO_PARTY_REGIONS as readonly string[]).includes(region.toUpperCase());
}

export const consentInputSchema = z.object({
  contactPhone: z.string().min(3).max(32),
  region: z.string().min(2).max(10),
  channel: z.enum(['voice', 'web', 'sms']).default('voice'),
  granted: z.boolean(),
  basis: z.string().max(200).optional(), // legal basis / disclosure text shown
});
export type ConsentInput = z.infer<typeof consentInputSchema>;

// ── DNC normalization ────────────────────────────────────────────────────────

/** Normalize a phone to a comparison key (digits, keep a leading country code). */
export function phoneKey(phone: string): string {
  const d = digits(phone);
  return d.length === 10 ? `1${d}` : d; // assume NANP when 10 digits
}

// ── Retention ────────────────────────────────────────────────────────────────

export const retentionPolicySchema = z.object({
  recordingsDays: z.number().int().min(0).max(3650).default(0), // 0 = keep forever
  transcriptsDays: z.number().int().min(0).max(3650).default(0),
  memoryDays: z.number().int().min(0).max(3650).default(0),
  redactTranscripts: z.boolean().default(false),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

/** Is a record created at `createdAt` past its `retentionDays` window? (0 days = never expires). */
export function isExpired(createdAt: Date, retentionDays: number, now: Date): boolean {
  if (retentionDays <= 0) return false;
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs > retentionDays * 86_400_000;
}
