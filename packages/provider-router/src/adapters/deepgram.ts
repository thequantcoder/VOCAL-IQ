import { type LiveSchema, LiveTranscriptionEvents, createClient } from '@deepgram/sdk';
import { Provider, ProviderError } from '@vocaliq/shared';
import type { STTEvent, STTOptions, STTProvider } from '../index.js';

/**
 * Deepgram streaming STT over the live WebSocket (`@deepgram/sdk` `listen.live`).
 * Audio chunks are pushed in as they arrive from the caller; transcripts (interim +
 * final) are yielded back via an internal async queue so the call loop can react to
 * partials for low-latency barge-in (Day 9). Cost is metered by the caller on audio
 * seconds (known when the stream ends) — the adapter never bills (golden rule #4).
 */
export class DeepgramSTT implements STTProvider {
  readonly provider = Provider.DEEPGRAM;
  readonly capability = 'stt' as const;
  readonly defaultModel = 'nova-3';

  constructor(private readonly apiKey: string) {}

  async *transcribeStream(
    audio: AsyncIterable<Uint8Array>,
    opts?: STTOptions,
  ): AsyncIterable<STTEvent> {
    const schema: LiveSchema = {
      model: opts?.model ?? this.defaultModel,
      interim_results: opts?.interimResults ?? true,
      smart_format: true,
      encoding: 'linear16',
      sample_rate: 16_000,
      channels: 1,
      ...(opts?.language ? { language: opts.language } : {}),
      // Key-term boosting (Day 39): nova-3 accepts `keyterm`; recognition of custom
      // brand/drug/SKU vocabulary is improved without a custom model.
      ...(opts?.keyterms?.length ? { keyterm: opts.keyterms } : {}),
    };

    let connection: ReturnType<ReturnType<typeof createClient>['listen']['live']>;
    try {
      connection = createClient(this.apiKey).listen.live(schema);
    } catch (cause) {
      throw new ProviderError('Deepgram connection failed', { cause });
    }

    // Bridge Deepgram's event callbacks into an async iterator the caller can `for await`.
    const queue: STTEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let finished = false;
    let failure: unknown;

    const wake = () => {
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data.channel?.alternatives?.[0];
      const transcript = alt?.transcript ?? '';
      if (transcript) {
        queue.push({ transcript, isFinal: Boolean(data.is_final) });
        wake();
      }
    });
    connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
      failure = err;
      finished = true;
      wake();
    });
    connection.on(LiveTranscriptionEvents.Close, () => {
      finished = true;
      wake();
    });

    // Pump caller audio into the socket once it's open, then signal end-of-stream.
    const pump = (async () => {
      await new Promise<void>((resolve) => {
        connection.on(LiveTranscriptionEvents.Open, () => resolve());
      });
      // Deepgram's socket wants an ArrayBuffer — hand it the chunk's exact byte range.
      for await (const chunk of audio)
        connection.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
      connection.requestClose();
    })().catch((err) => {
      failure = err;
      finished = true;
      wake();
    });

    try {
      while (true) {
        if (queue.length === 0 && !finished) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) yield next;
        }
        if (finished && queue.length === 0) break;
      }
      if (failure) throw new ProviderError('Deepgram stream error', { cause: failure });
    } finally {
      await pump.catch(() => {});
    }
  }
}
