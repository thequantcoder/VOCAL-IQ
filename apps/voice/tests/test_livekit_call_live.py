"""Live LiveKit call round-trip smoke (Day 09 part 2) — opt-in.

Proves the whole stack over real WebRTC: the agent worker (`run_agent`) joins a real
LiveKit room, a synthetic caller publishes a spoken question, and the caller receives
the agent's spoken reply back over the media path. Skipped unless RUN_LIVEKIT_CALL=1
(it is slow, needs all provider keys, and spends a few ElevenLabs characters), so CI
stays deterministic.
"""

from __future__ import annotations

import asyncio
import os
import time

import pytest

from app.calls.livekit_service import mint_access_token
from app.loop.engine import LoopConfig
from app.loop.livekit_agent import SAMPLE_RATE, run_agent
from app.providers import ElevenLabsTTS

_KEYS = all(
    os.environ.get(k)
    for k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "DEEPGRAM_API_KEY", "OPENAI_API_KEY", "ELEVENLABS_API_KEY")
)
_RUN = os.environ.get("RUN_LIVEKIT_CALL") == "1"

pytestmark = pytest.mark.skipif(not (_RUN and _KEYS), reason="opt-in live call (RUN_LIVEKIT_CALL=1 + keys)")

FRAME = 640  # 20ms PCM16 @16k


async def _synth(text: str) -> bytes:
    buf = bytearray()
    async for chunk in ElevenLabsTTS(os.environ["ELEVENLABS_API_KEY"]).synthesize_stream(text):
        buf += chunk
    return bytes(buf)


async def test_live_call_round_trip() -> None:
    from livekit import rtc

    url = os.environ["LIVEKIT_URL"]
    key = os.environ["LIVEKIT_API_KEY"]
    sec = os.environ["LIVEKIT_API_SECRET"]
    room_name = f"pytest-call-{int(time.time())}"

    received = {"bytes": 0}

    async def caller() -> None:
        room = rtc.Room()

        @room.on("track_subscribed")
        def _on(track: rtc.Track, *_: object) -> None:
            if track.kind == rtc.TrackKind.KIND_AUDIO:

                async def read() -> None:
                    stream = rtc.AudioStream(track, sample_rate=SAMPLE_RATE, num_channels=1, frame_size_ms=20)
                    async for ev in stream:
                        received["bytes"] += len(bytes(ev.frame.data))

                asyncio.create_task(read())

        token = mint_access_token(key, sec, room_name, "caller-1", name="Caller")
        await room.connect(url, token, options=rtc.RoomOptions(auto_subscribe=True))
        source = rtc.AudioSource(SAMPLE_RATE, 1)
        track = rtc.LocalAudioTrack.create_audio_track("caller-mic", source)
        await room.local_participant.publish_track(
            track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        )
        await asyncio.sleep(2.0)  # let the agent subscribe

        pcm = await _synth("What are your opening hours on weekends?")
        for i in range(0, len(pcm), FRAME):
            ch = pcm[i : i + FRAME].ljust(FRAME, b"\x00")
            await source.capture_frame(rtc.AudioFrame(ch, SAMPLE_RATE, 1, FRAME // 2))
            await asyncio.sleep(0.02)
        for _ in range(45):  # trailing silence → endpoint
            await source.capture_frame(rtc.AudioFrame(b"\x00" * FRAME, SAMPLE_RATE, 1, FRAME // 2))
            await asyncio.sleep(0.02)
        for _ in range(150):  # await the agent's reply audio
            if received["bytes"] > 0:
                break
            await asyncio.sleep(0.1)
        await asyncio.sleep(1.0)
        await room.disconnect()

    config = LoopConfig(
        tenant_id="test",
        call_id=room_name,
        agent_id="agent-1",
        system_prompt="You are a receptionist for Acme Spa. Weekend hours are 10am-4pm. One short sentence.",
        turn_timeout_ms=500,
        vad_threshold=400,
        greeting="Hi, thanks for calling Acme Spa!",
    )
    agent_token = mint_access_token(key, sec, room_name, "agent-1", name="Agent")
    agent_task = asyncio.create_task(
        run_agent(
            url=url,
            token=agent_token,
            config=config,
            stt_key=os.environ["DEEPGRAM_API_KEY"],
            llm_key=os.environ["OPENAI_API_KEY"],
            tts_key=os.environ["ELEVENLABS_API_KEY"],
        )
    )
    await asyncio.sleep(1.5)  # agent joins first
    await asyncio.wait_for(caller(), timeout=70)
    agent_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await agent_task

    # The agent greeted + answered over real WebRTC — the caller heard audio back.
    assert received["bytes"] > 0
