import { Capability, Provider, type UsageRecord, isAppError } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { DeepgramSTT } from './adapters/deepgram.js';
import { ElevenLabsTTS } from './adapters/elevenlabs.js';
import { LiveKitMedia } from './adapters/livekit.js';
import { TwilioTelephony } from './adapters/twilio.js';
import type { KeyResolver, STTProvider, TTSProvider, UsageMeter } from './index.js';
import { Router } from './router.js';

type MeterArg = Omit<UsageRecord, 'tenantId' | 'capability' | 'ts'>;

function fakeTTS(provider: Provider): TTSProvider {
  return {
    provider,
    capability: 'tts',
    defaultModel: 'eleven_turbo_v2_5',
    async *synthesizeStream() {
      yield new Uint8Array([1]);
    },
  };
}
function fakeSTT(provider: Provider): STTProvider {
  return {
    provider,
    capability: 'stt',
    defaultModel: 'nova-3',
    async *transcribeStream() {
      yield { transcript: 'hi', isFinal: true };
    },
  };
}

describe('media routing (TTS/STT)', () => {
  it('selectTTS resolves a key and builds the configured adapter', async () => {
    const resolveKey: KeyResolver = async () => ({ apiKey: 'k', byok: false });
    const router = new Router({
      resolveKey,
      meter: async () => {},
      ttsFactories: { [Provider.ELEVENLABS]: () => fakeTTS(Provider.ELEVENLABS) },
    });
    const tts = await router.selectTTS({ tenantId: 't', capability: Capability.TTS });
    expect(tts.provider).toBe(Provider.ELEVENLABS);
  });

  it('selectSTT falls back when the first provider has no key', async () => {
    const resolveKey: KeyResolver = vi.fn<KeyResolver>(async (_t, provider) => {
      if (provider === Provider.ASSEMBLYAI) throw new Error('no key');
      return { apiKey: 'k', byok: false };
    });
    const router = new Router({
      resolveKey,
      meter: async () => {},
      sttOrder: [Provider.ASSEMBLYAI, Provider.DEEPGRAM],
      sttFactories: {
        [Provider.ASSEMBLYAI]: () => fakeSTT(Provider.ASSEMBLYAI),
        [Provider.DEEPGRAM]: () => fakeSTT(Provider.DEEPGRAM),
      },
    });
    const stt = await router.selectSTT({ tenantId: 't', capability: Capability.STT });
    expect(stt.provider).toBe(Provider.DEEPGRAM);
  });

  it('throws when no media provider is available', async () => {
    const router = new Router({
      resolveKey: async () => ({ apiKey: 'k', byok: false }),
      meter: async () => {},
    });
    await expect(router.selectTTS({ tenantId: 't', capability: Capability.TTS })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'PROVIDER',
    );
  });

  it('meterMedia computes per-capability cost and emits a UsageRecord', async () => {
    const calls: MeterArg[] = [];
    const meter: UsageMeter = async (r) => {
      calls.push(r);
    };
    const router = new Router({ resolveKey: async () => ({ apiKey: 'k', byok: false }), meter });

    await router.meterMedia({
      provider: Provider.ELEVENLABS,
      capability: Capability.TTS,
      units: 1_000,
      byok: false,
      priceKey: 'eleven_turbo_v2_5',
    });
    await router.meterMedia({
      provider: Provider.DEEPGRAM,
      capability: Capability.STT,
      units: 60,
      byok: true,
      priceKey: 'nova-3',
    });

    expect(calls[0]).toMatchObject({ provider: Provider.ELEVENLABS, units: 1_000 });
    expect(calls[0]?.costUsd).toBeCloseTo(0.15, 10);
    expect(calls[1]).toMatchObject({ provider: Provider.DEEPGRAM, byok: true });
    expect(calls[1]?.costUsd).toBeCloseTo(0.0043, 10);
  });
});

describe('adapter stubs throw until live verification (pending keys)', () => {
  it('TTS/STT/telephony/media stubs reject with a ProviderError', async () => {
    const tts = new ElevenLabsTTS('k');
    await expect(
      (async () => {
        for await (const _ of tts.synthesizeStream('hi')) void _;
      })(),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');

    const stt = new DeepgramSTT('k');
    await expect(
      (async () => {
        for await (const _ of stt.transcribeStream((async function* () {})())) void _;
      })(),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');

    await expect(new TwilioTelephony('sid', 'tok').dial('+1', '+1')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'PROVIDER',
    );
    await expect(new LiveKitMedia('u', 'k', 's').createRoom('r')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'PROVIDER',
    );
  });
});
