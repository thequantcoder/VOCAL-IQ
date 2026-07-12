import { ValidationError } from '@vocaliq/shared';
import { z } from 'zod';
import type { PrismaService } from '../db/prisma.service';
import { CONSENT_BASES, type OutboundService } from './outbound.service';

/** E.164: leading +, country digit 1-9, up to 15 total digits (matches the outbound schema). */
const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Instant-dial contract: enough to create/dedupe a lead from a bare phone number and immediately
 * dial it. `consentBasis` is required (TCPA-style) exactly like a normal outbound call — the caller
 * asserts the lawful basis. Optional contact/lead fields are attached to the auto-created lead.
 */
export const instantDialSchema = z.object({
  to: z.string().regex(E164, 'to must be an E.164 number'),
  agentId: z.string().uuid(),
  consentBasis: z.enum(CONSENT_BASES),
  from: z.string().regex(E164).optional(),
  name: z.string().max(200).optional(),
  email: z.string().email().max(254).optional(),
  source: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(50).optional(),
  // Free-form contact fields + lead dynamic vars (templated into scripts as strings).
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  dynamicVars: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});
export type InstantDialInput = z.infer<typeof instantDialSchema>;

export interface InstantDialResult {
  callId: string;
  status: string;
  leadId: string;
  contactId: string;
  consentBasis: string;
}

/**
 * The "instant AI call" primitive (public API `POST /v1/calls/dial`): given a phone number + agent,
 * upsert (dedupe by phone) a Contact + Lead, then hand off to the vetted OutboundService dial path
 * (DNC + abuse + concurrency + rate gates + metering all reused). Everything is tenant-scoped (RLS).
 * n8n / Form-to-Call build on this.
 */
export class InstantDialService {
  constructor(
    private readonly db: PrismaService,
    private readonly outbound: OutboundService,
  ) {}

  async dial(tenantId: string, input: unknown): Promise<InstantDialResult> {
    const parsed = instantDialSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid dial request');
    }
    const data = parsed.data;

    // ── Upsert Contact + Lead by phone (dedupe) under RLS ──────────────────────────
    const { contactId, leadId } = await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.contact.findFirst({
        where: { phone: data.to },
        select: { id: true, fields: true, tags: true },
      });

      let cId: string;
      if (existing) {
        // Merge new details onto the existing contact (don't clobber what's already there).
        const mergedFields = { ...((existing.fields as object) ?? {}), ...(data.fields ?? {}) };
        const mergedTags = Array.from(new Set([...existing.tags, ...(data.tags ?? [])]));
        await tx.contact.update({
          where: { id: existing.id },
          data: {
            ...(data.name ? { name: data.name } : {}),
            ...(data.email ? { email: data.email } : {}),
            ...(data.source ? { source: data.source } : {}),
            fields: mergedFields as object,
            tags: mergedTags,
          },
        });
        cId = existing.id;
      } else {
        const created = await tx.contact.create({
          data: {
            tenantId,
            phone: data.to,
            ...(data.name ? { name: data.name } : {}),
            ...(data.email ? { email: data.email } : {}),
            ...(data.source ? { source: data.source } : { source: 'instant-dial' }),
            fields: data.fields ?? {},
            tags: data.tags ?? [],
          },
          select: { id: true },
        });
        cId = created.id;
      }

      // Ensure a single Lead per contact (dedupe): reuse if present, else create.
      const lead = await tx.lead.findFirst({ where: { contactId: cId }, select: { id: true } });
      let lId: string;
      if (lead) {
        if (data.dynamicVars) {
          await tx.lead.update({ where: { id: lead.id }, data: { dynamicVars: data.dynamicVars } });
        }
        lId = lead.id;
      } else {
        const createdLead = await tx.lead.create({
          data: {
            tenantId,
            contactId: cId,
            ...(data.dynamicVars ? { dynamicVars: data.dynamicVars } : {}),
          },
          select: { id: true },
        });
        lId = createdLead.id;
      }
      return { contactId: cId, leadId: lId };
    });

    // ── Dispatch via the vetted outbound path (gates + Call row + dial + metering) ──
    const call = await this.outbound.placeCall(tenantId, {
      agentId: data.agentId,
      to: data.to,
      contactId,
      consentBasis: data.consentBasis,
      ...(data.from ? { from: data.from } : {}),
    });

    return {
      callId: call.callId,
      status: call.status,
      leadId,
      contactId,
      consentBasis: call.consentBasis,
    };
  }
}
