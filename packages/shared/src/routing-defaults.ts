import { z } from 'zod';
import { Capability, Provider } from './enums.js';

/**
 * Routing defaults (Day 57) — the platform/tenant policy for WHICH provider serves each
 * capability, with ordered fallbacks. Pure: validation + chain resolution only; the actual
 * provider calls go through packages/provider-router (golden rule #2). Adding a provider is a
 * config change here, never a code rewrite.
 */

/** Which concrete providers can serve each capability class. */
export const CAPABILITY_PROVIDERS: Record<Capability, Provider[]> = {
  [Capability.LLM]: [
    Provider.OPENAI,
    Provider.ANTHROPIC,
    Provider.GEMINI,
    Provider.GROK,
    Provider.OPENROUTER,
  ],
  [Capability.TTS]: [Provider.ELEVENLABS, Provider.PLAYHT, Provider.CARTESIA],
  [Capability.STT]: [Provider.DEEPGRAM, Provider.ASSEMBLYAI],
  [Capability.TELEPHONY]: [Provider.TWILIO, Provider.TELNYX, Provider.LIVEKIT],
  [Capability.EMBEDDING]: [Provider.OPENAI, Provider.GEMINI],
};

/** Is `provider` valid for `capability`? */
export function providerSupports(capability: Capability, provider: Provider): boolean {
  return CAPABILITY_PROVIDERS[capability]?.includes(provider) ?? false;
}

const providerEnum = z.nativeEnum(Provider);

/** One capability's policy: a primary provider + an ordered fallback list. */
export const capabilityRouteSchema = z.object({
  primary: providerEnum,
  fallbacks: z.array(providerEnum).max(4).default([]),
});
export type CapabilityRoute = z.infer<typeof capabilityRouteSchema>;

/** Partial map — a capability with no entry uses the code default. */
export const routingDefaultsSchema = z.object({
  llm: capabilityRouteSchema.optional(),
  tts: capabilityRouteSchema.optional(),
  stt: capabilityRouteSchema.optional(),
  telephony: capabilityRouteSchema.optional(),
  embedding: capabilityRouteSchema.optional(),
});
export type RoutingDefaults = z.infer<typeof routingDefaultsSchema>;

/**
 * Validate a full routing config: every referenced provider must actually support its capability,
 * and no provider may appear twice within one capability's chain. Returns the parsed config or
 * throws a ZodError-compatible error via the schema; the cross-field checks throw a plain Error
 * with a clear message the API maps to a ValidationError.
 */
export function validateRoutingDefaults(input: unknown): RoutingDefaults {
  const parsed = routingDefaultsSchema.parse(input);
  for (const [cap, route] of Object.entries(parsed) as [Capability, CapabilityRoute][]) {
    if (!route) continue;
    const chain = [route.primary, ...route.fallbacks];
    for (const p of chain) {
      if (!providerSupports(cap, p)) {
        throw new Error(`${p} cannot serve ${cap}`);
      }
    }
    if (new Set(chain).size !== chain.length) {
      throw new Error(`Duplicate provider in the ${cap} routing chain`);
    }
  }
  return parsed;
}

/**
 * The ordered provider chain to try for a capability: the configured primary + fallbacks, else
 * the code default (the first provider that supports the capability). Never returns an empty
 * chain for a known capability.
 */
export function resolveProviderChain(
  defaults: RoutingDefaults,
  capability: Capability,
): Provider[] {
  const route = defaults[capability];
  if (route) return [route.primary, ...route.fallbacks];
  const fallback = CAPABILITY_PROVIDERS[capability]?.[0];
  return fallback ? [fallback] : [];
}
