import { Provider, ProviderError } from '@vocaliq/shared';
import type { TTSOptions, TTSProvider } from '../index.js';

/** Default voice ("Roger") — overridable per agent via TTSOptions.voiceId. */
const DEFAULT_VOICE_ID = 'CwhRBWXzGAHq8TQ4Fs17';
const API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * ElevenLabs streaming TTS over the documented REST stream endpoint
 * (`POST /v1/text-to-speech/{voiceId}/stream`). Verified live: returns raw PCM16
 * mono @16 kHz (`output_format=pcm_16000`, `content-type: audio/pcm`) — the format
 * the telephony/LiveKit media bridge consumes. No SDK: native `fetch` keeps the
 * dependency surface (and cold-start) small.
 *
 * Cost is metered by the caller on `text.length` characters (CODE-PATTERNS §3) —
 * the adapter itself never bills (golden rule #4 keeps metering in the Router).
 */
export class ElevenLabsTTS implements TTSProvider {
  readonly provider = Provider.ELEVENLABS;
  readonly capability = 'tts' as const;
  readonly defaultModel = 'eleven_turbo_v2_5';

  constructor(private readonly apiKey: string) {}

  async *synthesizeStream(text: string, opts?: TTSOptions): AsyncIterable<Uint8Array> {
    const voiceId = opts?.voiceId ?? DEFAULT_VOICE_ID;
    const settings = opts?.settings ?? { stability: 0.5, similarity_boost: 0.75 };
    let res: Response;
    try {
      res = await fetch(
        `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_16000`,
        {
          method: 'POST',
          headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: opts?.model ?? this.defaultModel,
            voice_settings: settings,
          }),
        },
      );
    } catch (cause) {
      throw new ProviderError('ElevenLabs TTS request failed', { cause });
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(`ElevenLabs TTS error ${res.status}`, {
        meta: { status: res.status, detail: detail.slice(0, 200) },
      });
    }
    // Stream PCM chunks as they arrive — never buffer the whole clip (low latency).
    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
