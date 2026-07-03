import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { RateLimiter } from '../widget/rate-limiter';
import { FormsService, type SheetSink, type WebhookSink } from './forms.service';

/**
 * Forms (Day 37), against real Postgres (RLS-scoped). Proves: CRUD + config validation,
 * public submit → Contact+Lead+Submission with sanitisation, routing to webhook/Sheet with
 * formula-escaping, invalid submissions rejected, and tenant scoping (child can't see parent).
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';

// Spy sinks so we can assert routing + formula-escaping without any external service.
const sheetRows: Record<string, string>[] = [];
const sheets: SheetSink = { append: async (_id, row) => void sheetRows.push(row) };
const webhookCalls: unknown[] = [];
const webhook: WebhookSink = { post: async (_url, payload) => void webhookCalls.push(payload) };
const svc = new FormsService(db, sheets, webhook, new RateLimiter(1000, 60_000));

const createdForms: string[] = [];
const createdContacts: string[] = [];

const FIELDS = [
  { key: 'full_name', label: 'Name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: false },
  { key: 'note', label: 'Note', type: 'text', required: false },
];

afterAll(async () => {
  await db.admin.formSubmission.deleteMany({ where: { formId: { in: createdForms } } });
  await db.admin.lead.deleteMany({ where: { contactId: { in: createdContacts } } });
  await db.admin.contact.deleteMany({ where: { id: { in: createdContacts } } });
  await db.admin.form.deleteMany({ where: { id: { in: createdForms } } });
});

async function makeForm(tenantId = C1, routing: object = {}) {
  const f = await svc.create(tenantId, { name: 'Contact us', fields: FIELDS, routing });
  createdForms.push(f.id);
  return f;
}

describe('FormsService', () => {
  it('rejects an invalid form config (duplicate keys / select without options)', async () => {
    await expect(
      svc.create(C1, {
        name: 'Bad',
        fields: [
          { key: 'a', label: 'A', type: 'text' },
          { key: 'a', label: 'A2', type: 'text' },
        ],
      }),
    ).rejects.toSatisfy(isAppError);
  });

  it('captures a valid submission as Contact + Lead + Submission and routes it', async () => {
    const form = await makeForm(C1, {
      webhookUrl: 'https://example.test/hook',
      sheetId: 'sheet-123',
    });

    const res = await svc.submit(
      form.id,
      {
        full_name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+14155550100',
        note: '=HYPERLINK("http://evil","x")', // formula-injection attempt
        junk: 'ignored',
      },
      '1.2.3.4',
    );
    expect(res.ok).toBe(true);
    expect(res.submissionId).toBeTruthy();

    // Contact was created in the tenant with identity extracted from typed fields.
    const contact = await db.admin.contact.findFirst({
      where: { tenantId: C1, email: 'ada@example.com' },
      select: { id: true, name: true, phone: true },
    });
    expect(contact?.name).toBe('Ada Lovelace');
    expect(contact?.phone).toBe('+14155550100'); // NOT formula-escaped in storage
    if (contact) createdContacts.push(contact.id);

    // Routed: webhook got the cleaned values; the sheet row is formula-escaped.
    expect(webhookCalls.length).toBe(1);
    expect(sheetRows.at(-1)?.note?.startsWith("'=")).toBe(true);

    // Submission marked synced after routing.
    const subs = await svc.submissions(C1, form.id);
    expect(subs[0]?.synced).toBe(true);
  });

  it('returns field errors for an invalid submission (no Lead created)', async () => {
    const form = await makeForm(C1);
    const res = await svc.submit(form.id, { email: 'not-an-email' }, '1.2.3.4');
    expect(res.ok).toBe(false);
    expect(res.errors?.map((e) => e.key)).toContain('full_name'); // required missing
    expect(res.errors?.map((e) => e.key)).toContain('email');
  });

  it("a child tenant cannot read a parent tenant's form", async () => {
    const parentForm = await makeForm(R1); // owned by the reseller (parent)
    // C1 is a child of R1 → RLS: child must NOT see the parent\'s row.
    await expect(svc.get(C1, parentForm.id)).rejects.toSatisfy(isAppError);
  });
});
