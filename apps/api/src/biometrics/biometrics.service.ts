import { createHash } from 'node:crypto';
import {
  type BiometricSettings,
  NotFoundError,
  ValidationError,
  type VerifyDecision,
  biometricSettingsSchema,
  enrollInputSchema,
  isBiometricRegionAllowed,
  isValidEmbedding,
  matchScore,
  verifyDecision,
} from '@vocaliq/shared';
import type { EnvelopeEncryptor } from '../crypto/envelope';
import type { PrismaService } from '../db/prisma.service';

/**
 * Voice biometrics — caller identity verification by voiceprint (Day 91). Enrollment captures a
 * consented voiceprint; verification matches a live sample at call time with an anti-spoof liveness
 * gate + a step-up fallback. Biometric data is among the MOST sensitive PII, so this service is
 * governed by construction (self-audit C):
 *  - Consent (C): enrollment requires explicit biometric consent (`consent === true`, schema-enforced);
 *    the consent timestamp is stored, and every action is audited.
 *  - Region legality (C): biometrics are OFF by default and DENY-by-default per region — enroll/verify
 *    run only when the tenant enabled biometrics AND explicitly allow-listed the caller's region.
 *  - Encryption (C): the embedding is envelope-encrypted at rest (`Bytes`) and is NEVER returned raw.
 *  - Anti-spoofing (C): a sample below the liveness floor is a spoof — never a pass, even at a perfect
 *    match (a replayed recording matches but isn't live).
 *  - Isolation (B): every read/write is `db.withTenant`-scoped — a tenant only ever touches its own
 *    voiceprints + audits.
 * The provider (which turns audio into an embedding + liveness) is injected — a deterministic local
 * default for self-host/tests; a real vendor is wired when `VOICE_BIOMETRICS_API_KEY` is set (gated).
 */

/** Turns a captured audio sample into a voiceprint embedding + a liveness (anti-spoof) score. */
export interface VoiceprintProvider {
  analyze(input: {
    tenantId: string;
    sample: string;
  }): Promise<{ embedding: number[]; liveness: number; provider: string }>;
}

export interface EnrollmentView {
  contactId: string;
  region: string;
  provider: string;
  dims: number;
  consentAt: Date;
  createdAt: Date;
}

export interface BiometricAuditView {
  id: string;
  contactId: string;
  event: string;
  outcome: string | null;
  score: number | null;
  liveness: number | null;
  region: string | null;
  createdAt: Date;
}

const ENROLL_SELECT = {
  contactId: true,
  region: true,
  provider: true,
  dims: true,
  consentAt: true,
  createdAt: true,
} as const;

const AUDIT_SELECT = {
  id: true,
  contactId: true,
  event: true,
  outcome: true,
  score: true,
  liveness: true,
  region: true,
  createdAt: true,
} as const;

/**
 * A deterministic local voiceprint provider (self-host / gated default): derives a stable, normalized
 * embedding from the sample via SHA-256 so the SAME sample enrolls + verifies consistently, without a
 * vendor. Liveness defaults high but is lowered when the sample is prefixed `spoof:` — a hook so the
 * anti-spoof path is exercisable until a real liveness-detecting vendor is wired.
 */
export function deterministicVoiceprintProvider(dims = 64): VoiceprintProvider {
  return {
    async analyze({ sample }) {
      const spoof = sample.startsWith('spoof:');
      const seed = spoof ? sample.slice('spoof:'.length) : sample;
      const embedding: number[] = [];
      let block = Buffer.alloc(0);
      let counter = 0;
      while (embedding.length < dims) {
        block = createHash('sha256').update(`${seed}:${counter++}`).digest();
        for (let i = 0; i < block.length && embedding.length < dims; i++) {
          embedding.push((block[i] as number) / 255 - 0.5); // centre around 0
        }
      }
      return { embedding, liveness: spoof ? 0.1 : 0.9, provider: 'local-deterministic' };
    },
  };
}

export class BiometricsService {
  constructor(
    private readonly db: PrismaService,
    private readonly encryptor: EnvelopeEncryptor,
    private readonly provider: VoiceprintProvider,
  ) {}

  // ── settings (tenant.settings.biometrics) ───────────────────────────────────────

  async getSettings(tenantId: string): Promise<BiometricSettings> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const raw = (t?.settings as { biometrics?: unknown } | null)?.biometrics;
    return biometricSettingsSchema.parse(raw ?? {});
  }

  async setSettings(tenantId: string, input: unknown): Promise<BiometricSettings> {
    const parsed = biometricSettingsSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid biometric settings');
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), biometrics: parsed.data };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return parsed.data;
  }

  /** Both gates every biometric op must clear: the tenant enabled biometrics AND allow-listed the region. */
  private async assertAllowed(tenantId: string, region: string): Promise<BiometricSettings> {
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled)
      throw new ValidationError('Voice biometrics is disabled for this workspace.');
    if (!isBiometricRegionAllowed(region, settings.allowedRegions))
      throw new ValidationError(`Voice biometrics is not permitted in region "${region}".`);
    return settings;
  }

  // ── enroll ──────────────────────────────────────────────────────────────────────

  /** Enroll a caller's voiceprint (consent + region + liveness gated; embedding encrypted at rest). */
  async enroll(tenantId: string, input: unknown): Promise<EnrollmentView> {
    const parsed = enrollInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid enrollment');
    const { contactId, region, sample } = parsed.data;
    const settings = await this.assertAllowed(tenantId, region);

    const { embedding, liveness, provider } = await this.provider.analyze({ tenantId, sample });
    if (!isValidEmbedding(embedding))
      throw new ValidationError('The captured sample did not yield a usable voiceprint.');
    // Anti-spoof at enrollment — never enroll a non-live (replayed) sample.
    if (liveness < settings.minLiveness) {
      await this.audit(tenantId, contactId, 'enroll', 'spoof', null, liveness, region);
      throw new ValidationError('Liveness check failed — enrollment rejected.');
    }

    // Envelope-encrypt the embedding; the raw vector is never stored or returned in the clear.
    const vector = this.encryptor.encrypt(JSON.stringify(embedding));
    const now = new Date();
    const view = await this.db.withTenant(tenantId, (tx) =>
      tx.voiceprint.upsert({
        where: { tenantId_contactId: { tenantId, contactId } },
        create: {
          tenantId,
          contactId,
          region: region.toUpperCase(),
          provider,
          dims: embedding.length,
          vector,
          consentAt: now,
        },
        update: {
          region: region.toUpperCase(),
          provider,
          dims: embedding.length,
          vector,
          consentAt: now,
        },
        select: ENROLL_SELECT,
      }),
    );
    await this.audit(tenantId, contactId, 'enroll', 'enrolled', null, liveness, region);
    return view;
  }

  // ── verify ────────────────────────────────────────────────────────────────────────

  /** Verify a live sample against the enrolled voiceprint (anti-spoof + threshold + step-up; audited). */
  async verify(tenantId: string, input: unknown): Promise<VerifyDecision> {
    const parsed = enrollInputSchema
      .pick({ contactId: true, region: true, sample: true })
      .safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid verification');
    const { contactId, region, sample } = parsed.data;
    const settings = await this.assertAllowed(tenantId, region);

    const enrollment = await this.db.withTenant(tenantId, (tx) =>
      tx.voiceprint.findFirst({
        where: { contactId },
        select: { vector: true, dims: true },
      }),
    );
    if (!enrollment) throw new NotFoundError('No voiceprint enrolled for this contact.');

    const { embedding, liveness } = await this.provider.analyze({ tenantId, sample });
    const enrolled = JSON.parse(this.encryptor.decrypt(enrollment.vector)) as number[];
    const score = matchScore(embedding, enrolled);
    const decision = verifyDecision({
      score,
      liveness,
      threshold: settings.threshold,
      minLiveness: settings.minLiveness,
    });

    await this.audit(tenantId, contactId, 'verify', decision.outcome, score, liveness, region);
    return decision;
  }

  // ── erase (GDPR) + reads ───────────────────────────────────────────────────────────

  /** Erase a contact's enrolled voiceprint (GDPR / right-to-erasure). The erase itself is audited. */
  async erase(tenantId: string, contactId: string): Promise<{ erased: number }> {
    const res = await this.db.withTenant(tenantId, (tx) =>
      tx.voiceprint.deleteMany({ where: { contactId } }),
    );
    await this.audit(tenantId, contactId, 'erase', 'erased', null, null, null);
    return { erased: res.count };
  }

  /** Enrollment metadata for a contact (never the raw embedding). Null if not enrolled. */
  async getEnrollment(tenantId: string, contactId: string): Promise<EnrollmentView | null> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.voiceprint.findFirst({ where: { contactId }, select: ENROLL_SELECT }),
    );
  }

  async listAudits(tenantId: string, contactId?: string): Promise<BiometricAuditView[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.voiceprintAudit.findMany({
        where: contactId ? { contactId } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: AUDIT_SELECT,
      }),
    );
  }

  private async audit(
    tenantId: string,
    contactId: string,
    event: string,
    outcome: string | null,
    score: number | null,
    liveness: number | null,
    region: string | null,
  ): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.voiceprintAudit.create({
        data: {
          tenantId,
          contactId,
          event,
          outcome,
          score,
          liveness,
          region: region ? region.toUpperCase() : null,
        },
      }),
    );
  }
}
