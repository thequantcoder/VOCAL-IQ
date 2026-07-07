import {
  NotFoundError,
  type OperatorLanguage,
  type TranscriptSegment,
  ValidationError,
  baseLang,
  captionInputSchema,
  detectScriptLanguage,
  hashText,
  isSupportedLanguage,
  needsTranslation,
  operatorLanguageSchema,
  sanitizeTranslation,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/** Max transcript segments translated in one call — bounds cost + latency (self-audit D/F). */
const MAX_TRANSLATE_SEGMENTS = 1000;

/**
 * The effective source language for the cache key: the declared source if given, else a best-effort
 * script detection, else 'auto'. Folding this into the key means identical text in DIFFERENT source
 * languages never collides to the same cached translation (self-audit A — no wrong translation served).
 */
function effectiveSource(sourceLanguage: string | null, text: string): string {
  const declared = baseLang(sourceLanguage);
  if (declared) return declared;
  return detectScriptLanguage(text) || 'auto';
}

/**
 * Real-time translation (Day 88). The caller is served natively (Day 25); the operator sees live
 * captions + dual-language transcripts in their working language. Guarantees:
 *  - A (fidelity): every translation goes through the {@link Translator} port with the shared fidelity
 *    prompt; output is sanitized; the source text is DATA, never instructions.
 *  - F (real-time): identical text for the same target is translated ONCE + cached (TranslationCache),
 *    so repeat captions + re-run transcripts are instant.
 *  - D (cost): same-language input never hits a model; every real translation is metered (the injected
 *    Translator routes through the metered RouterService — no un-metered LLM path).
 *  - B (isolation): everything is RLS-scoped (`db.withTenant`).
 */

/** Metered LLM translation — tenant-scoped (the production impl routes through RouterService). */
export type Translator = (input: {
  tenantId: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  text: string;
}) => Promise<{ translatedText: string; model: string }>;

export interface CaptionResult {
  text: string;
  cached: boolean;
  /** true when the source was already the target language (no translation performed). */
  passthrough: boolean;
}

/** A stored dual-language transcript translation (the translated view of a call). */
export interface StoredTranslation {
  id: string;
  callId: string;
  targetLang: string;
  segments: unknown;
  summary: string | null;
  model: string | null;
  createdAt: Date;
}

export class TranslationService {
  constructor(
    private readonly db: PrismaService,
    private readonly translator: Translator,
  ) {}

  // ── operator working language (tenant.settings) ─────────────────────────────────

  async getOperatorLanguage(tenantId: string): Promise<OperatorLanguage> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const s = (t?.settings ?? {}) as { operatorLanguage?: string; translationEnabled?: boolean };
    const lang =
      s.operatorLanguage && isSupportedLanguage(s.operatorLanguage) ? s.operatorLanguage : 'en';
    return { targetLanguage: lang, enabled: s.translationEnabled === true };
  }

  async setOperatorLanguage(tenantId: string, input: unknown): Promise<OperatorLanguage> {
    const parsed = operatorLanguageSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid language settings');
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = {
      ...((t?.settings as object) ?? {}),
      operatorLanguage: parsed.data.targetLanguage,
      translationEnabled: parsed.data.enabled,
    };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return parsed.data;
  }

  // ── live caption (cached, metered) ──────────────────────────────────────────────

  /** Translate one utterance for the operator. Same-language → passthrough; else cache-or-translate. */
  async caption(tenantId: string, input: unknown): Promise<CaptionResult> {
    const parsed = captionInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid caption request');
    const { text, sourceLanguage, targetLanguage } = parsed.data;
    const translated = await this.translateText(
      tenantId,
      text,
      sourceLanguage ?? null,
      targetLanguage,
    );
    return translated;
  }

  /**
   * The core translate-or-cache primitive. Skips the model for same-language text (self-audit D),
   * returns a cache hit instantly (self-audit F), and otherwise translates (metered) + caches.
   */
  private async translateText(
    tenantId: string,
    text: string,
    sourceLanguage: string | null,
    targetLanguage: string,
  ): Promise<CaptionResult> {
    const sourceLang = effectiveSource(sourceLanguage, text);
    if (!needsTranslation(sourceLang, targetLanguage, text))
      return { text, cached: false, passthrough: true };

    const sourceHash = hashText(text);
    const hit = await this.db.withTenant(tenantId, (tx) =>
      tx.translationCache.findFirst({
        where: { tenantId, sourceHash, sourceLang, targetLang: targetLanguage },
        select: { text: true },
      }),
    );
    if (hit) return { text: hit.text, cached: true, passthrough: false };

    const { translatedText } = await this.translator({
      tenantId,
      sourceLanguage,
      targetLanguage,
      text,
    });
    const clean = sanitizeTranslation(translatedText);
    // An empty model response is NOT cached (it would permanently blank this caption); fall back to the
    // original text so the operator at least sees the native line rather than nothing.
    if (!clean) return { text, cached: false, passthrough: false };

    // Cache for reuse (idempotent — a concurrent writer just wins the unique row; we ignore the clash).
    await this.db
      .withTenant(tenantId, (tx) =>
        tx.translationCache.create({
          data: { tenantId, sourceHash, sourceLang, targetLang: targetLanguage, text: clean },
        }),
      )
      .catch(() => {
        /* unique clash on a concurrent identical translation — the cached value is equivalent */
      });
    return { text: clean, cached: false, passthrough: false };
  }

  // ── transcript translation (dual-language, stored) ──────────────────────────────

  /** Translate a call's transcript into `targetLang`, store it (dual-language), and return it. */
  async translateTranscript(
    tenantId: string,
    callId: string,
    targetLang: string,
  ): Promise<StoredTranslation> {
    if (!isSupportedLanguage(targetLang)) throw new ValidationError('Unsupported language');

    const transcript = await this.db.withTenant(tenantId, (tx) =>
      tx.transcript.findFirst({
        where: { callId },
        select: { segments: true, summary: true },
      }),
    );
    if (!transcript) throw new NotFoundError('Transcript not found');

    const all = Array.isArray(transcript.segments)
      ? (transcript.segments as unknown as TranscriptSegment[])
      : [];
    // Cap the work per translate call — bounds cost + latency (self-audit D/F). The cache dedupes
    // repeated lines, so a re-run is cheap; a huge transcript is truncated (rare).
    const segments = all.slice(0, MAX_TRANSLATE_SEGMENTS);

    // Translate each segment's text (reusing the per-utterance cache) + the summary. The per-line source
    // language is best-effort detected in effectiveSource, so the cache never crosses source languages.
    let model = '';
    const translatedSegments: TranscriptSegment[] = [];
    for (const seg of segments) {
      const src = (seg.text ?? '').toString();
      if (!src.trim()) {
        translatedSegments.push(seg);
        continue;
      }
      const res = await this.translateWithModel(tenantId, src, null, targetLang);
      if (res.model) model = res.model;
      translatedSegments.push({ ...seg, text: res.text });
    }
    let summary: string | null = transcript.summary ?? null;
    if (summary?.trim()) {
      const res = await this.translateWithModel(tenantId, summary, null, targetLang);
      summary = res.text;
      if (res.model) model = res.model;
    }

    return this.db.withTenant(tenantId, (tx) =>
      tx.transcriptTranslation.upsert({
        where: { callId_targetLang: { callId, targetLang } },
        create: {
          tenantId,
          callId,
          targetLang,
          segments: translatedSegments as object,
          summary,
          model: model || null,
        },
        // On a re-run every line is a cache hit (model=''); keep the existing model rather than nulling
        // the audit field (self-audit — don't lose which model produced the translation).
        update: {
          segments: translatedSegments as object,
          summary,
          ...(model ? { model } : {}),
        },
        select: TRANSLATION_SELECT,
      }),
    );
  }

  /** Like translateText but also surfaces the serving model (for the stored translation's audit). */
  private async translateWithModel(
    tenantId: string,
    text: string,
    sourceLanguage: string | null,
    targetLanguage: string,
  ): Promise<{ text: string; model: string }> {
    const sourceLang = effectiveSource(sourceLanguage, text);
    if (!needsTranslation(sourceLang, targetLanguage, text)) return { text, model: '' };
    const sourceHash = hashText(text);
    const hit = await this.db.withTenant(tenantId, (tx) =>
      tx.translationCache.findFirst({
        where: { tenantId, sourceHash, sourceLang, targetLang: targetLanguage },
        select: { text: true },
      }),
    );
    if (hit) return { text: hit.text, model: '' };
    const { translatedText, model } = await this.translator({
      tenantId,
      sourceLanguage,
      targetLanguage,
      text,
    });
    const clean = sanitizeTranslation(translatedText);
    if (!clean) return { text, model }; // don't cache an empty translation
    await this.db
      .withTenant(tenantId, (tx) =>
        tx.translationCache.create({
          data: { tenantId, sourceHash, sourceLang, targetLang: targetLanguage, text: clean },
        }),
      )
      .catch(() => {});
    return { text: clean, model };
  }

  /** The stored translated transcript for a call + language, or null if not yet translated. */
  async getTranscriptTranslation(
    tenantId: string,
    callId: string,
    targetLang: string,
  ): Promise<StoredTranslation | null> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.transcriptTranslation.findFirst({
        where: { callId, targetLang },
        select: TRANSLATION_SELECT,
      }),
    );
  }
}

const TRANSLATION_SELECT = {
  id: true,
  callId: true,
  targetLang: true,
  segments: true,
  summary: true,
  model: true,
  createdAt: true,
} as const;
