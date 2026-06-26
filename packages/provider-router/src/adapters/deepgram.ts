import { Provider, ProviderError } from '@vocaliq/shared';
import type { STTEvent, STTOptions, STTProvider } from '../index.js';

/**
 * Deepgram streaming STT. SCAFFOLD — body lands with DEEPGRAM_API_KEY + live
 * verification.
 *
 * TODO(Day 07 live): open a Deepgram live WebSocket (model nova-3, interim_results),
 * push audio chunks, yield {transcript, isFinal} events. Cost metered on audio seconds.
 */
export class DeepgramSTT implements STTProvider {
  readonly provider = Provider.DEEPGRAM;
  readonly capability = 'stt' as const;
  readonly defaultModel = 'nova-3';

  constructor(private readonly apiKey: string) {}

  // biome-ignore lint/correctness/useYield: stub throws before yielding (impl pending keys).
  async *transcribeStream(
    _audio: AsyncIterable<Uint8Array>,
    _opts?: STTOptions,
  ): AsyncIterable<STTEvent> {
    void this.apiKey;
    throw new ProviderError('Deepgram STT adapter not yet implemented (pending live verification)');
  }
}
