import {
  type FormConfig,
  type FormField,
  type FormRouting,
  NotFoundError,
  RateLimitError,
  ValidationError,
  escapeForSheet,
  formConfigSchema,
  validateSubmission,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import { RateLimiter } from '../widget/rate-limiter';

/** Explicit DTOs so the public API type never leaks Prisma runtime types (TS2742). */
export interface FormDto {
  id: string;
  name: string;
  fields: FormField[];
  routing: FormRouting;
  active: boolean;
  submissionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** What an unauthenticated visitor sees — never the routing (webhook/sheet are private). */
export interface PublicFormDto {
  id: string;
  name: string;
  fields: FormField[];
}

export interface SubmitResult {
  ok: boolean;
  submissionId?: string;
  errors?: { key: string; message: string }[];
}

/**
 * A Google-Sheets append port (Day 37). The real Sheets push lives behind this so forms
 * work with NO external sheet (self-hosted default) and light up when `GOOGLE_OAUTH_*` is
 * set. Default is a no-op (gated). Values are formula-escaped by the caller before append.
 */
export interface SheetSink {
  append(sheetId: string, row: Record<string, string>): Promise<void>;
}
export const noopSheetSink: SheetSink = { append: async () => {} };

/** A webhook delivery port — default posts JSON with global fetch (self-hosted, no vendor). */
export interface WebhookSink {
  post(url: string, payload: unknown): Promise<void>;
}
export const fetchWebhookSink: WebhookSink = {
  post: async (url, payload) => {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  },
};

const FORM_SELECT = {
  id: true,
  name: true,
  fields: true,
  routing: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { submissions: true } },
} as const;

interface FormRow {
  id: string;
  name: string;
  fields: unknown;
  routing: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { submissions: number };
}

function toDto(row: FormRow): FormDto {
  return {
    id: row.id,
    name: row.name,
    fields: row.fields as FormField[],
    routing: (row.routing ?? {}) as FormRouting,
    active: row.active,
    submissionCount: row._count.submissions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Public lead-capture forms (Day 37). Tenants build typed forms; visitors submit on an
 * UNAUTHENTICATED path. Every submission is validated + sanitised (@vocaliq/shared), turned
 * into a Contact + Lead, then routed to a webhook and/or Google Sheet (gated port). Reads/
 * writes are RLS-scoped via `withTenant` (self-audit B); the public path resolves the
 * form's tenant with an admin lookup then re-scopes, and is rate-limited (self-audit C).
 */
export class FormsService {
  private readonly limiter: RateLimiter;

  constructor(
    private readonly db: PrismaService,
    private readonly sheets: SheetSink = noopSheetSink,
    private readonly webhook: WebhookSink = fetchWebhookSink,
    limiter?: RateLimiter,
  ) {
    // ≤10 submissions per caller (ip+form) per minute — abuse guard on the public route.
    this.limiter = limiter ?? new RateLimiter(10, 60_000);
  }

  // ── Authenticated CRUD (config writers) ─────────────────────────────────────

  async list(tenantId: string): Promise<FormDto[]> {
    const rows = (await this.db.withTenant(tenantId, (tx) =>
      tx.form.findMany({ select: FORM_SELECT, orderBy: { createdAt: 'desc' } }),
    )) as FormRow[];
    return rows.map(toDto);
  }

  async get(tenantId: string, id: string): Promise<FormDto> {
    const row = (await this.db.withTenant(tenantId, (tx) =>
      tx.form.findFirst({ where: { id }, select: FORM_SELECT }),
    )) as FormRow | null;
    if (!row) throw new NotFoundError('Form not found');
    return toDto(row);
  }

  async create(tenantId: string, input: unknown): Promise<FormDto> {
    const cfg = this.parseConfig(input);
    const row = (await this.db.withTenant(tenantId, (tx) =>
      tx.form.create({
        data: {
          tenantId,
          name: cfg.name,
          fields: cfg.fields as unknown as object,
          routing: cfg.routing as unknown as object,
        },
        select: FORM_SELECT,
      }),
    )) as FormRow;
    return toDto(row);
  }

  async update(tenantId: string, id: string, input: unknown): Promise<FormDto> {
    const cfg = this.parseConfig(input);
    const row = (await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.form.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Form not found');
      return tx.form.update({
        where: { id },
        data: {
          name: cfg.name,
          fields: cfg.fields as unknown as object,
          routing: cfg.routing as unknown as object,
        },
        select: FORM_SELECT,
      });
    })) as FormRow;
    return toDto(row);
  }

  async setActive(tenantId: string, id: string, active: boolean): Promise<FormDto> {
    const row = (await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.form.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Form not found');
      return tx.form.update({ where: { id }, data: { active }, select: FORM_SELECT });
    })) as FormRow;
    return toDto(row);
  }

  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.form.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Form not found');
      await tx.form.delete({ where: { id } });
      return { id };
    });
  }

  /** List a form's submissions (authenticated, tenant-scoped). */
  async submissions(
    tenantId: string,
    formId: string,
  ): Promise<{ id: string; values: Record<string, string>; synced: boolean; createdAt: Date }[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const form = await tx.form.findFirst({ where: { id: formId }, select: { id: true } });
      if (!form) throw new NotFoundError('Form not found');
      const rows = await tx.formSubmission.findMany({
        where: { formId },
        select: { id: true, values: true, synced: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return rows.map((r) => ({
        id: r.id,
        values: (r.values ?? {}) as Record<string, string>,
        synced: r.synced,
        createdAt: r.createdAt,
      }));
    });
  }

  // ── Public (unauthenticated) ────────────────────────────────────────────────

  /** The public render config — active forms only, routing withheld. */
  async publicConfig(formId: string): Promise<PublicFormDto> {
    const form = await this.db.admin.form.findFirst({
      where: { id: formId, active: true },
      select: { id: true, name: true, fields: true },
    });
    if (!form) throw new NotFoundError('This form is not available.');
    return { id: form.id, name: form.name, fields: form.fields as FormField[] };
  }

  /**
   * Handle a public submission: rate-limit → resolve the active form (admin lookup for
   * its tenant) → validate + sanitise → within the tenant's RLS scope, upsert a Contact,
   * create a Lead + FormSubmission → route to webhook/Sheet best-effort (never blocks).
   */
  async submit(formId: string, values: unknown, clientKey: string): Promise<SubmitResult> {
    if (!this.limiter.hit(`${clientKey}:${formId}`)) {
      throw new RateLimitError('Too many submissions — please wait a moment.');
    }
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      throw new ValidationError('Submission body must be an object');
    }

    const form = await this.db.admin.form.findFirst({
      where: { id: formId, active: true },
      select: { id: true, tenantId: true, fields: true, routing: true },
    });
    if (!form) throw new NotFoundError('This form is not available.');

    const fields = form.fields as FormField[];
    const result = validateSubmission(fields, values as Record<string, unknown>);
    if (!result.ok) return { ok: false, errors: result.errors };

    const { cleaned } = result;
    const tenantId = form.tenantId;
    const identity = extractIdentity(fields, cleaned);

    const submissionId = await this.db.withTenant(tenantId, async (tx) => {
      const contact = await tx.contact.create({
        data: {
          tenantId,
          source: 'form',
          ...(identity.name ? { name: identity.name } : {}),
          ...(identity.email ? { email: identity.email } : {}),
          ...(identity.phone ? { phone: identity.phone } : {}),
          fields: cleaned,
        },
        select: { id: true },
      });
      await tx.lead.create({
        data: { tenantId, contactId: contact.id, status: 'NEW', dynamicVars: cleaned },
      });
      const submission = await tx.formSubmission.create({
        data: { tenantId, formId, contactId: contact.id, values: cleaned },
        select: { id: true },
      });
      return submission.id;
    });

    // Routing is best-effort and MUST NOT fail the submission (self-audit E).
    const routing = (form.routing ?? {}) as FormRouting;
    const synced = await this.route(routing, cleaned);
    if (synced) {
      await this.db
        .withTenant(tenantId, (tx) =>
          tx.formSubmission.update({ where: { id: submissionId }, data: { synced: true } }),
        )
        .catch(() => {});
    }

    return { ok: true, submissionId };
  }

  /** Deliver a submission to the configured webhook + Sheet. Returns true if any sink ran. */
  private async route(routing: FormRouting, cleaned: Record<string, string>): Promise<boolean> {
    let delivered = false;
    if (routing.webhookUrl) {
      try {
        await this.webhook.post(routing.webhookUrl, cleaned);
        delivered = true;
      } catch {
        // swallow — a bad webhook never loses the captured lead
      }
    }
    if (routing.sheetId) {
      try {
        const escaped: Record<string, string> = {};
        for (const [k, v] of Object.entries(cleaned)) escaped[k] = escapeForSheet(v);
        await this.sheets.append(routing.sheetId, escaped);
        delivered = true;
      } catch {
        // swallow — Sheets sync is gated/best-effort
      }
    }
    return delivered;
  }

  private parseConfig(input: unknown): FormConfig {
    const parsed = formConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid form config');
    }
    return parsed.data;
  }
}

/** Pull name/email/phone out of the cleaned values by matching field types. */
function extractIdentity(
  fields: FormField[],
  cleaned: Record<string, string>,
): { name?: string; email?: string; phone?: string } {
  const out: { name?: string; email?: string; phone?: string } = {};
  for (const f of fields) {
    const v = cleaned[f.key];
    if (!v) continue;
    if (f.type === 'email' && !out.email) out.email = v;
    else if (f.type === 'phone' && !out.phone) out.phone = v;
    else if (!out.name && /name/i.test(f.key)) out.name = v;
  }
  return out;
}
