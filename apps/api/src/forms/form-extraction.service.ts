import {
  type FormField,
  buildFormExtractionPrompt,
  parseFormExtraction,
  segmentsToText,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/** Metered LLM completion port (wired to RouterService.complete — golden rule #4, no un-metered path). */
export type ExtractionComplete = (input: {
  tenantId: string;
  system: string;
  user: string;
}) => Promise<string>;

/** Persist port (wired to `FormsService.submitForCall` — Contact + Lead + FormSubmission + routing). */
export type ExtractionSubmit = (
  tenantId: string,
  formId: string,
  values: Record<string, string>,
) => Promise<unknown>;

export interface FormExtractionResult {
  /** `no_forms` = the agent's flow has no configured FORM node (no LLM spend); `skipped` = no usable
   *  call/transcript; `ok` = extraction ran (`submitted` = how many forms persisted values). */
  status: 'skipped' | 'no_forms' | 'ok';
  submitted: number;
}

/**
 * Post-call form extraction (PARITY-03, voice leg). The voice loop is LLM-driven — it doesn't run the
 * deterministic SAY/LISTEN expansion the chat runtime uses — so on voice the form's answers are pulled
 * from the call TRANSCRIPT after the call: a metered LLM completion per referenced form (Day-31
 * post-call-intel pattern), parsed by the strict shared `parseFormExtraction`, then persisted through
 * the same `submitForCall` path the chat runtime uses (which re-validates every field). Best-effort by
 * design: any per-form failure is swallowed — extraction must never break call teardown. All reads are
 * RLS-scoped (self-audit B); a flow with no FORM node costs zero LLM spend (self-audit D).
 */
export class FormExtractionService {
  constructor(
    private readonly db: PrismaService,
    private readonly complete: ExtractionComplete,
    private readonly submit: ExtractionSubmit,
  ) {}

  async extractForCall(tenantId: string, callId: string): Promise<FormExtractionResult> {
    const ctx = await this.db.withTenant(tenantId, async (tx) => {
      const call = await tx.call.findFirst({
        where: { id: callId },
        select: { id: true, agentId: true },
      });
      if (!call?.agentId) return null;

      const flow = await tx.flow.findFirst({
        where: { agentId: call.agentId },
        select: { id: true },
      });
      const published = flow
        ? await tx.flowVersion.findFirst({
            where: { flowId: flow.id, publishedAt: { not: null } },
            orderBy: { version: 'desc' },
            select: { graph: true },
          })
        : null;
      const formIds = published ? formIdsInGraph(published.graph) : [];
      if (formIds.length === 0) return { forms: [], text: '' };

      const rows = await tx.form.findMany({
        where: { id: { in: formIds }, active: true },
        select: { id: true, fields: true },
      });
      const transcript = await tx.transcript.findFirst({
        where: { callId },
        select: { segments: true },
      });
      return {
        forms: rows.map((r) => ({ id: r.id, fields: r.fields as FormField[] })),
        text: segmentsToText(transcript?.segments),
      };
    });

    if (!ctx) return { status: 'skipped', submitted: 0 };
    if (ctx.forms.length === 0) return { status: 'no_forms', submitted: 0 };
    if (!ctx.text) return { status: 'skipped', submitted: 0 };

    let submitted = 0;
    for (const form of ctx.forms) {
      try {
        const { system, user } = buildFormExtractionPrompt(form.fields, ctx.text);
        const raw = await this.complete({ tenantId, system, user });
        const values = parseFormExtraction(form.fields, raw);
        if (Object.keys(values).length === 0) continue;
        await this.submit(tenantId, form.id, values);
        submitted++;
      } catch {
        // best-effort per form — extraction must never break call teardown
      }
    }
    return { status: 'ok', submitted };
  }
}

/** The configured formIds on a stored graph's FORM nodes (defensive — the graph is open JSON). */
function formIdsInGraph(graph: unknown): string[] {
  const nodes =
    (graph as { nodes?: Array<{ type?: string; data?: { config?: { formId?: unknown } } }> })
      ?.nodes ?? [];
  return [
    ...new Set(
      nodes
        .filter((n) => n.type === 'FORM')
        .map((n) => (typeof n.data?.config?.formId === 'string' ? n.data.config.formId : ''))
        .filter((id) => id.length > 0),
    ),
  ];
}
