import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { DeepgramSTT } from './adapters/deepgram.js';
import { ElevenLabsTTS } from './adapters/elevenlabs.js';
import { LiveKitMedia } from './adapters/livekit.js';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

/**
 * Live media smokes — proof the real adapters talk to the real providers. They SKIP
 * when keys are absent (CI), so they never block the gate but prove the path locally
 * (Day 07 DoD: "synth speech, transcribe clip, create LiveKit room").
 *
 * The ElevenLabs synth smoke is OFF unless RUN_TTS_SMOKE=1 — it spends characters, and
 * the project's starter plan is near its monthly cap. Enable it deliberately.
 */

const lk = process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET;
const liveLiveKit = lk ? describe : describe.skip;

liveLiveKit('LiveKit (live)', () => {
  it('creates a room and mints a join token the server would accept', async () => {
    const media = new LiveKitMedia(
      process.env.LIVEKIT_URL as string,
      process.env.LIVEKIT_API_KEY as string,
      process.env.LIVEKIT_API_SECRET as string,
    );
    const name = `smoke-${Date.now()}`;
    const { room } = await media.createRoom(name);
    expect(room).toBe(name);
    const token = await media.token(room, 'agent-smoke');
    expect(token.split('.')).toHaveLength(3);
  });
});

const dg = process.env.DEEPGRAM_API_KEY;
const liveDeepgram = dg ? describe : describe.skip;

liveDeepgram('Deepgram (live)', () => {
  it('opens a live transcription socket and closes cleanly on end-of-audio', async () => {
    // One small silent PCM16 frame: proves auth + the socket lifecycle without needing
    // real speech (transcript may be empty — we assert the stream completes without error).
    const audio = (async function* () {
      yield new Uint8Array(640); // 20ms of 16kHz mono silence
    })();
    const events = [];
    for await (const e of new DeepgramSTT(dg as string).transcribeStream(audio, {
      interimResults: false,
    })) {
      events.push(e);
    }
    expect(Array.isArray(events)).toBe(true);
  }, 15_000);
});

const runTts = process.env.RUN_TTS_SMOKE === '1' && process.env.ELEVENLABS_API_KEY;
const liveTts = runTts ? describe : describe.skip;

liveTts('ElevenLabs (live, spends characters — opt-in)', () => {
  it('streams PCM audio bytes for a short phrase', async () => {
    const chunks: Uint8Array[] = [];
    for await (const c of new ElevenLabsTTS(
      process.env.ELEVENLABS_API_KEY as string,
    ).synthesizeStream('hi')) {
      chunks.push(c);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    expect(total).toBeGreaterThan(0);
  }, 20_000);
});
