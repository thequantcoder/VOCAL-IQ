import { describe, expect, it } from 'vitest';
import { Capability, Provider } from './enums.js';
import {
  providerSupports,
  resolveProviderChain,
  validateRoutingDefaults,
} from './routing-defaults.js';

describe('providerSupports', () => {
  it('knows which providers serve which capability', () => {
    expect(providerSupports(Capability.LLM, Provider.ANTHROPIC)).toBe(true);
    expect(providerSupports(Capability.TTS, Provider.ELEVENLABS)).toBe(true);
    expect(providerSupports(Capability.LLM, Provider.ELEVENLABS)).toBe(false);
    expect(providerSupports(Capability.STT, Provider.DEEPGRAM)).toBe(true);
  });
});

describe('validateRoutingDefaults', () => {
  it('accepts a valid config', () => {
    const cfg = validateRoutingDefaults({
      llm: { primary: Provider.ANTHROPIC, fallbacks: [Provider.OPENAI] },
      tts: { primary: Provider.ELEVENLABS },
    });
    expect(cfg.llm?.primary).toBe(Provider.ANTHROPIC);
    expect(cfg.tts?.fallbacks).toEqual([]);
  });

  it('rejects a provider that cannot serve the capability', () => {
    expect(() => validateRoutingDefaults({ llm: { primary: Provider.ELEVENLABS } })).toThrow(
      /cannot serve/,
    );
  });

  it('rejects a duplicate provider in a chain', () => {
    expect(() =>
      validateRoutingDefaults({
        llm: { primary: Provider.OPENAI, fallbacks: [Provider.OPENAI] },
      }),
    ).toThrow(/Duplicate/);
  });
});

describe('resolveProviderChain', () => {
  it('returns the configured primary + fallbacks in order', () => {
    const cfg = validateRoutingDefaults({
      llm: { primary: Provider.ANTHROPIC, fallbacks: [Provider.OPENAI, Provider.GEMINI] },
    });
    expect(resolveProviderChain(cfg, Capability.LLM)).toEqual([
      Provider.ANTHROPIC,
      Provider.OPENAI,
      Provider.GEMINI,
    ]);
  });

  it('falls back to the code default when a capability is unset', () => {
    const chain = resolveProviderChain({}, Capability.STT);
    expect(chain.length).toBeGreaterThan(0);
    expect(providerSupports(Capability.STT, chain[0]!)).toBe(true);
  });
});
