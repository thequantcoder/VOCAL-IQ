"""LiveKit RTC transport for the ConversationLoop (Day 09 part 2).

Binds the transport-agnostic engine to a real LiveKit room so it becomes an actual
call: the agent worker joins the room, subscribes to the caller's audio track (frames
in), and publishes its own track (agent audio out). LiveKit resamples on both edges —
we ask the inbound `AudioStream` for 16 kHz/20 ms frames and publish a 16 kHz source —
so the engine keeps working in the PCM16@16k it already speaks.

`LiveKitAudioSink.clear()` maps barge-in straight onto `AudioSource.clear_queue()`, so
an interrupted agent stops speaking immediately.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator

from livekit import rtc

from app.loop.engine import AudioSink, ConversationLoop, LoopConfig
from app.providers.adapters.deepgram import DeepgramSTT
from app.providers.adapters.elevenlabs import ElevenLabsTTS
from app.providers.adapters.openai import OpenAILLM

SAMPLE_RATE = 16_000
NUM_CHANNELS = 1
FRAME_MS = 20


class LiveKitAudioSink:
    """Engine → LiveKit: publish agent PCM16 frames; `clear()` flushes on barge-in.

    TTS chunks can arrive with an odd byte count, but an `AudioFrame` must be int16-
    aligned, so a dangling byte is carried into the next write.
    """

    def __init__(self, source: rtc.AudioSource) -> None:
        self._source = source
        self._carry = b""

    async def write(self, pcm16: bytes) -> None:
        data = self._carry + pcm16
        if len(data) % 2:
            self._carry = data[-1:]
            data = data[:-1]
        else:
            self._carry = b""
        if not data:
            return
        frame = rtc.AudioFrame(
            data=data,
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
            samples_per_channel=len(data) // 2,
        )
        await self._source.capture_frame(frame)

    async def clear(self) -> None:
        # Drop everything still queued for playout so a barged-in turn goes silent now.
        self._carry = b""
        self._source.clear_queue()


class CallerAudio:
    """LiveKit → engine: an async iterator of the caller's PCM16 frames.

    A background reader pushes 20ms frames onto a queue as the subscribed `AudioStream`
    delivers them; the iterator ends when the caller leaves / the room disconnects.
    """

    def __init__(self, maxsize: int = 200) -> None:
        self._queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=maxsize)
        self._closed = False

    def feed_track(self, track: rtc.Track) -> asyncio.Task[None]:
        """Start reading a subscribed audio track into the queue; returns the reader task."""
        stream = rtc.AudioStream(
            track, sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS, frame_size_ms=FRAME_MS
        )

        async def reader() -> None:
            try:
                async for event in stream:
                    if self._closed:
                        break
                    with contextlib.suppress(asyncio.QueueFull):
                        self._queue.put_nowait(bytes(event.frame.data))
            finally:
                await stream.aclose()

        return asyncio.create_task(reader())

    def close(self) -> None:
        self._closed = True
        with contextlib.suppress(asyncio.QueueFull):
            self._queue.put_nowait(None)

    async def __aiter__(self) -> AsyncIterator[bytes]:
        while True:
            frame = await self._queue.get()
            if frame is None:
                return
            yield frame


async def run_agent(
    *,
    url: str,
    token: str,
    config: LoopConfig,
    stt_key: str,
    llm_key: str,
    tts_key: str,
    audio_sink_factory: type[AudioSink] = LiveKitAudioSink,  # injectable for tests
) -> None:
    """Join the room as the agent and run the conversation loop until disconnect."""
    room = rtc.Room()
    caller = CallerAudio()
    reader_tasks: list[asyncio.Task[None]] = []

    @room.on("track_subscribed")
    def _on_track(track: rtc.Track, *_: object) -> None:
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            reader_tasks.append(caller.feed_track(track))

    @room.on("disconnected")
    def _on_disconnect(*_: object) -> None:
        caller.close()

    await room.connect(url, token, options=rtc.RoomOptions(auto_subscribe=True))

    # Publish the agent's own audio track (the engine writes into this source).
    source = rtc.AudioSource(SAMPLE_RATE, NUM_CHANNELS)
    track = rtc.LocalAudioTrack.create_audio_track("agent-voice", source)
    await room.local_participant.publish_track(
        track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    )

    loop = ConversationLoop(
        stt=DeepgramSTT(stt_key),
        llm=OpenAILLM(llm_key),
        tts=ElevenLabsTTS(tts_key),
        audio_out=audio_sink_factory(source),  # type: ignore[call-arg]
        config=config,
    )
    try:
        await loop.run(caller.__aiter__())
    finally:
        caller.close()
        for task in reader_tasks:
            task.cancel()
        with contextlib.suppress(Exception):
            await source.aclose()
        await room.disconnect()
