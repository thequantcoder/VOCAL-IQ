import {
  type CloneRequest,
  NotFoundError,
  Provider,
  ProviderError,
  ValidationError,
  type VoiceFilter,
  type VoiceSettings,
  type VoiceView,
  cloneRequestSchema,
  filterVoices,
  isVoiceUsable,
  normalizeVoiceSettings,
  voiceFilterSchema,
  voiceSettingsSchema,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTO so the public API type never leaks Prisma's runtime types (TS2742). */
export interface VoiceDto extends VoiceView {
  usable: boolean;
  settings: VoiceSettings;
  createdAt: Date;
}

/**
 * The provider-side cloning port. Injected so the service is unit-tested with a fake
 * cloner (no live ElevenLabs call in CI) and the real path is wired in the module.
 * `clone` returns the provider's new voice id; the caller owns consent + persistence.
 */
export interface VoiceCloner {
  readonly provider: string;
  clone(input: { name: string; sampleUrls: string[] }): Promise<{ providerVoiceId: string }>;
}
export const VOICE_CLONER = Symbol('VOICE_CLONER');

const VOICE_SELECT = {
  id: true,
  tenantId: true,
  provider: true,
  providerVoiceId: true,
  name: true,
  language: true,
  gender: true,
  age: true,
  accent: true,
  style: true,
  isCloned: true,
  approved: true,
  settings: true,
  createdAt: true,
} as const;

type VoiceRow = {
  id: string;
  tenantId: string | null;
  provider: Provider;
  providerVoiceId: string;
  name: string;
  language: string | null;
  gender: string | null;
  age: string | null;
  accent: string | null;
  style: string | null;
  isCloned: boolean;
  approved: boolean;
  settings: unknown;
  createdAt: Date;
};

function toDto(row: VoiceRow): VoiceDto {
  return {
    id: row.id,
    provider: row.provider,
    providerVoiceId: row.providerVoiceId,
    name: row.name,
    language: row.language,
    gender: row.gender,
    age: row.age,
    accent: row.accent,
    style: row.style,
    isCloned: row.isCloned,
    approved: row.approved,
    isPreset: row.tenantId === null,
    usable: isVoiceUsable(row),
    settings: normalizeVoiceSettings(row.settings),
    createdAt: row.createdAt,
  };
}

/**
 * Voice library + per-agent assignment + gated cloning (Day 26). Every read/write is
 * RLS-scoped via `withTenant`; RLS also surfaces public presets (tenantId = null) so a
 * fresh tenant sees a usable library. A cloned voice is created UNAPPROVED and cannot be
 * assigned to an agent until an operator approves it — the consent/approval gate lives in
 * `isVoiceUsable`, enforced on every assignment (self-audit B + C).
 */
export class VoicesService {
  constructor(
    private readonly db: PrismaService,
    private readonly cloner: VoiceCloner,
  ) {}

  /** The browsable library: presets + this tenant's voices, filtered. */
  async list(tenantId: string, filter: unknown): Promise<VoiceDto[]> {
    const parsed = voiceFilterSchema.safeParse(filter ?? {});
    if (!parsed.success) throw new ValidationError('Invalid voice filter');
    const f: VoiceFilter = parsed.data;
    const rows = (await this.db.withTenant(tenantId, (tx) =>
      tx.voice.findMany({ select: VOICE_SELECT, orderBy: [{ isCloned: 'asc' }, { name: 'asc' }] }),
    )) as VoiceRow[];
    const dtos = rows.map(toDto);
    // Filter over the DTO shape (adds isPreset); returned rows keep the usable flag.
    const views = filterVoices(dtos as VoiceView[], f);
    const keep = new Set(views.map((v) => v.id));
    return dtos.filter((d) => keep.has(d.id));
  }

  async get(tenantId: string, id: string): Promise<VoiceDto> {
    const row = (await this.db.withTenant(tenantId, (tx) =>
      tx.voice.findFirst({ where: { id }, select: VOICE_SELECT }),
    )) as VoiceRow | null;
    if (!row) throw new NotFoundError('Voice not found');
    return toDto(row);
  }

  /**
   * Update tuning sliders. Presets (tenantId = null) are read-only — a tenant tunes its
   * own private copy, never the shared preset. RLS `WITH CHECK` also blocks writes to
   * preset rows, but we reject early with a clear error.
   */
  async updateSettings(tenantId: string, id: string, input: unknown): Promise<VoiceDto> {
    const parsed = voiceSettingsSchema.partial().safeParse(input ?? {});
    if (!parsed.success) throw new ValidationError('Invalid voice settings');
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = (await tx.voice.findFirst({
        where: { id },
        select: { id: true, tenantId: true, settings: true },
      })) as { id: string; tenantId: string | null; settings: unknown } | null;
      if (!existing) throw new NotFoundError('Voice not found');
      if (existing.tenantId === null) throw new ValidationError('Preset voices cannot be edited');
      const merged = normalizeVoiceSettings({
        ...normalizeVoiceSettings(existing.settings),
        ...parsed.data,
      });
      const row = (await tx.voice.update({
        where: { id },
        data: { settings: merged },
        select: VOICE_SELECT,
      })) as VoiceRow;
      return toDto(row);
    });
  }

  /**
   * Assign default + optional fallback voices to an agent. Both voices must be visible to
   * the tenant AND usable — an unapproved clone is rejected here (the gate). Runs in one
   * transaction so a partial assignment can't leak an unusable voice onto a live agent.
   */
  async assignToAgent(
    tenantId: string,
    agentId: string,
    input: { defaultVoiceId: string; fallbackVoiceId?: string | null },
  ): Promise<{ agentId: string; defaultVoiceId: string; fallbackVoiceId: string | null }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId }, select: { id: true } });
      if (!agent) throw new NotFoundError('Agent not found');

      const assertUsable = async (voiceId: string, label: string) => {
        const v = (await tx.voice.findFirst({
          where: { id: voiceId },
          select: { id: true, isCloned: true, approved: true },
        })) as { id: string; isCloned: boolean; approved: boolean } | null;
        if (!v) throw new NotFoundError(`${label} voice not found`);
        if (!isVoiceUsable(v)) {
          throw new ValidationError(
            `${label} voice is a clone pending approval and cannot be used`,
          );
        }
      };

      await assertUsable(input.defaultVoiceId, 'Default');
      const fallbackVoiceId = input.fallbackVoiceId ?? null;
      if (fallbackVoiceId) await assertUsable(fallbackVoiceId, 'Fallback');

      await tx.agent.update({
        where: { id: agentId },
        data: { defaultVoiceId: input.defaultVoiceId, fallbackVoiceId },
      });
      return { agentId, defaultVoiceId: input.defaultVoiceId, fallbackVoiceId };
    });
  }

  /**
   * Clone a voice from consented samples. Consent is mandatory (schema requires
   * `consentGiven: true`); the consent record is stored on `consentRef` so the clone is
   * auditable. The new voice is created UNAPPROVED — unusable until `approve` (Day 26 DoD).
   */
  async clone(tenantId: string, input: unknown, consentedAtIso: string): Promise<VoiceDto> {
    const parsed = cloneRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid clone request');
    }
    const req: CloneRequest = parsed.data;

    let providerVoiceId: string;
    try {
      ({ providerVoiceId } = await this.cloner.clone({
        name: req.name,
        sampleUrls: req.sampleUrls,
      }));
    } catch (cause) {
      throw new ProviderError('Voice cloning failed at the provider', { cause });
    }

    const consentRef = {
      consentGiven: true as const,
      subjectName: req.consent.subjectName,
      statement: req.consent.statement,
      consentedAt: req.consent.consentedAt ?? consentedAtIso,
    };

    const row = (await this.db.withTenant(tenantId, (tx) =>
      tx.voice.create({
        data: {
          tenantId,
          provider: Provider.ELEVENLABS,
          providerVoiceId,
          name: req.name,
          isCloned: true,
          approved: false,
          consentRef,
          ...(req.language ? { language: req.language } : {}),
          ...(req.gender ? { gender: req.gender } : {}),
        },
        select: VOICE_SELECT,
      }),
    )) as VoiceRow;
    return toDto(row);
  }

  /** Approve a pending clone — the only path that makes a clone usable (operator action). */
  async approve(tenantId: string, id: string): Promise<VoiceDto> {
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = (await tx.voice.findFirst({
        where: { id },
        select: { id: true, tenantId: true, isCloned: true },
      })) as { id: string; tenantId: string | null; isCloned: boolean } | null;
      if (!existing) throw new NotFoundError('Voice not found');
      if (existing.tenantId === null) throw new ValidationError('Preset voices are already usable');
      if (!existing.isCloned) throw new ValidationError('Only cloned voices require approval');
      const row = (await tx.voice.update({
        where: { id },
        data: { approved: true },
        select: VOICE_SELECT,
      })) as VoiceRow;
      return toDto(row);
    });
  }
}

/**
 * Live ElevenLabs cloner (Instant Voice Cloning): `POST /v1/voices/add` with a multipart
 * form of downloaded samples. Gated behind a real key — in CI a fake cloner is injected.
 */
export function elevenLabsCloner(apiKey: string): VoiceCloner {
  const API_BASE = 'https://api.elevenlabs.io/v1';
  return {
    provider: Provider.ELEVENLABS,
    async clone({ name, sampleUrls }) {
      if (!apiKey) throw new ProviderError('ELEVENLABS_API_KEY is not set');
      const form = new FormData();
      form.append('name', name);
      for (let i = 0; i < sampleUrls.length; i++) {
        const url = sampleUrls[i];
        if (!url) continue;
        const res = await fetch(url);
        if (!res.ok) throw new ProviderError(`Failed to fetch sample ${i} (${res.status})`);
        const blob = await res.blob();
        form.append('files', blob, `sample-${i}.mp3`);
      }
      const res = await fetch(`${API_BASE}/voices/add`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new ProviderError(`ElevenLabs clone error ${res.status}`, {
          meta: { status: res.status, detail: detail.slice(0, 200) },
        });
      }
      const json = (await res.json()) as { voice_id?: string };
      if (!json.voice_id) throw new ProviderError('ElevenLabs clone returned no voice_id');
      return { providerVoiceId: json.voice_id };
    },
  };
}
