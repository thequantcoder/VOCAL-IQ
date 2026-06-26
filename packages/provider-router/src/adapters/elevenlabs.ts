import { Provider, ProviderError } from '@vocaliq/shared';
import type { TTSOptions, TTSProvider } from '../index.js';

/**
 * ElevenLabs streaming TTS. SCAFFOLD — the contract + default model are set;
 * the streaming body lands once ELEVENLABS_API_KEY is provided and verified
 * against the live API (CLAUDE.md §15 — never guess provider behaviour).
 *
 * TODO(Day 07 live): POST /v1/text-to-speech/{voiceId}/stream with model_id +
 * voice_settings; yield audio chunks. Cost metered on `text.length` (chars).
 */
export class ElevenLabsTTS implements TTSProvider {
  readonly provider = Provider.ELEVENLABS;
  readonly capability = 'tts' as const;
  readonly defaultModel = 'eleven_turbo_v2_5';

  constructor(private readonly apiKey: string) {}

  // biome-ignore lint/correctness/useYield: stub throws before yielding (impl pending keys).
  async *synthesizeStream(_text: string, _opts?: TTSOptions): AsyncIterable<Uint8Array> {
    void this.apiKey;
    throw new ProviderError(
      'ElevenLabs TTS adapter not yet implemented (pending live verification)',
    );
  }
}
