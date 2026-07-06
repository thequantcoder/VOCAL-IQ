import { z } from 'zod';

/**
 * Custom fine-tuned / customised models per tenant (Day 76). An advanced tenant can define a
 * brand-specific model profile: a base LLM + a brand system-prompt, and OPTIONALLY a provider
 * fine-tune trained on their own (consented) data. Two properties are non-negotiable and encoded
 * here: CONSENT — a profile can't be created without an explicit, recorded consent (self-audit C);
 * and the routing resolution is pure so the router uses the tenant's fine-tune id + brand prompt
 * deterministically. Isolation (self-audit B) is enforced at the data layer (RLS) — a profile is
 * strictly tenant-scoped and can never be resolved for another tenant.
 */

/** LLM providers that can host a customised/fine-tuned model (subset of the platform Provider enum). */
export const CUSTOM_MODEL_PROVIDERS = [
  'OPENAI',
  'ANTHROPIC',
  'GEMINI',
  'GROK',
  'OPENROUTER',
] as const;
export type CustomModelProvider = (typeof CUSTOM_MODEL_PROVIDERS)[number];

/** draft → (training if a provider fine-tune was kicked off) → ready | failed. */
export const CUSTOM_MODEL_STATUS = ['draft', 'training', 'ready', 'failed'] as const;
export type CustomModelStatus = (typeof CUSTOM_MODEL_STATUS)[number];

/** The recorded consent for training/using a brand model on tenant data — mandatory. */
export const modelConsentSchema = z.object({
  consentGiven: z.literal(true),
  consentedBy: z.string().min(1).max(120),
  consentText: z.string().min(1).max(500),
});
export type ModelConsent = z.infer<typeof modelConsentSchema>;

export const customModelSchema = z.object({
  name: z.string().min(1).max(80),
  provider: z.enum(CUSTOM_MODEL_PROVIDERS),
  baseModel: z.string().min(1).max(120),
  /** Brand tone / domain instructions injected as the system prompt on every completion. */
  systemPrompt: z.string().max(8000).optional(),
  /** Request an actual provider fine-tune (gated on a configured fine-tune provider). */
  requestFineTune: z.boolean().default(false),
  consent: modelConsentSchema,
});
export type CustomModelInput = z.infer<typeof customModelSchema>;

/** A resolved model profile (from the DB) — what the router needs to route a completion. */
export interface CustomModelProfile {
  provider: CustomModelProvider;
  baseModel: string;
  fineTuneId: string | null;
  systemPrompt: string | null;
  status: CustomModelStatus;
}

/**
 * Consent gate (self-audit C): a custom model — brand-tuned and possibly trained on tenant data —
 * cannot be created without an explicit, recorded consent. Returns a typed reason on refusal.
 */
export function canCreateCustomModel(input: {
  consent?: { consentGiven?: boolean; consentedBy?: string; consentText?: string };
}): { ok: true } | { ok: false; reason: string } {
  const c = input.consent;
  if (!c || c.consentGiven !== true)
    return { ok: false, reason: 'Explicit consent is required to create a custom model.' };
  if (!c.consentedBy?.trim())
    return { ok: false, reason: 'Consent must record who authorised it.' };
  if (!c.consentText?.trim()) return { ok: false, reason: 'Consent must record what was agreed.' };
  return { ok: true };
}

/**
 * Resolve a model profile to the concrete routing the provider Router uses. A ready fine-tune
 * routes to its provider fine-tune id; otherwise the base model + the brand system prompt (a
 * "customised" model works with no fine-tune at all). Pure + deterministic.
 */
export function resolveModelRouting(profile: CustomModelProfile): {
  provider: CustomModelProvider;
  model: string;
  system?: string;
} {
  const model =
    profile.status === 'ready' && profile.fineTuneId ? profile.fineTuneId : profile.baseModel;
  return {
    provider: profile.provider,
    model,
    ...(profile.systemPrompt ? { system: profile.systemPrompt } : {}),
  };
}
