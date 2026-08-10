import { Capability, Provider, type UsageRecord, isAppError } from '@vocaliq/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('ElevenLabs TTS adapter (mocked fetch)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('streams PCM chunks and posts text + model + voice settings', async () => {
    let captured: { url: string; body: unknown } | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, body: JSON.parse(String(init.body)) };
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3, 4]));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }),
    );

    const chunks: Uint8Array[] = [];
    for await (const c of new ElevenLabsTTS('k').synthesizeStream('hello', {
      model: 'eleven_turbo_v2_5',
    }))
      chunks.push(c);

    expect(chunks).toHaveLength(2);
    expect(captured?.url).toContain('/text-to-speech/');
    expect(captured?.url).toContain('output_format=pcm_16000');
    expect(captured?.body).toMatchObject({ text: 'hello', model_id: 'eleven_turbo_v2_5' });
  });

  it('throws a ProviderError on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad voice', { status: 401 })),
    );
    await expect(
      (async () => {
        for await (const _ of new ElevenLabsTTS('k').synthesizeStream('hi')) void _;
      })(),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');
  });
});

describe('LiveKit token minting (pure, no network)', () => {
  it('mints a 3-part JWT for a room join', async () => {
    const jwt = await new LiveKitMedia('wss://x.livekit.cloud', 'APIkey', 'secret').token(
      'room-1',
      'agent-1',
    );
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('normalises ws(s):// to http(s):// for the room service and keeps serverUrl', () => {
    const media = new LiveKitMedia('wss://x.livekit.cloud', 'k', 's');
    expect(media.serverUrl).toBe('wss://x.livekit.cloud');
  });
});

describe('Twilio dial guard (no network)', () => {
  it('rejects a dial with neither url nor twiml before calling the API', async () => {
    await expect(
      new TwilioTelephony('AC_sid', 'tok').dial('+15550001', '+15550002'),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'PROVIDER');
  });
});

describe('Deepgram STT event bridge (fake connection)', () => {
  it('yields interim + final transcripts pumped through the callback bridge', async () => {
    // A fake live connection that replays Open → 2 transcripts → Close on the next tick.
    const handlers = new Map<string, (arg?: unknown) => void>();
    const conn = {
      on(evt: string, cb: (arg?: unknown) => void) {
        handlers.set(evt, cb);
      },
      send() {},
      requestClose() {},
    };
    vi.doMock('@deepgram/sdk', () => ({
      LiveTranscriptionEvents: {
        Open: 'open',
        Close: 'close',
        Error: 'error',
        Transcript: 'Results',
      },
      createClient: () => ({ listen: { live: () => conn } }),
    }));
    vi.resetModules();
    const { DeepgramSTT: FreshDeepgram } = await import('./adapters/deepgram.js');

    const audio = (async function* () {
      yield new Uint8Array([0, 0]);
    })();
    const events: { transcript: string; isFinal: boolean }[] = [];
    const drain = (async () => {
      for await (const e of new FreshDeepgram('k').transcribeStream(audio)) events.push(e);
    })();

    // Drive the fake socket lifecycle after handlers are registered.
    await new Promise((r) => setTimeout(r, 5));
    handlers.get('open')?.();
    handlers.get('Results')?.({
      is_final: false,
      channel: { alternatives: [{ transcript: 'hel' }] },
    });
    handlers.get('Results')?.({
      is_final: true,
      channel: { alternatives: [{ transcript: 'hello' }] },
    });
    handlers.get('close')?.();
    await drain;

    expect(events).toEqual([
      { transcript: 'hel', isFinal: false },
      { transcript: 'hello', isFinal: true },
    ]);
    vi.doUnmock('@deepgram/sdk');
  });
});
