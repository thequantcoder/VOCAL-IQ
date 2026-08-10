"""Unit tests for the LiveKit RTC transport adapters (Day 09 part 2).

The RTC edges are faked (no network): a stub AudioSource records captured frames and
flush calls; CallerAudio's queue/iterator is driven directly. The full round-trip against
live LiveKit lives in the key-gated smoke (test_livekit_call_live.py)."""

from __future__ import annotations

import asyncio

from app.loop.livekit_agent import CallerAudio, LiveKitAudioSink


class FakeSource:
    def __init__(self) -> None:
        self.frames: list[bytes] = []
        self.clears = 0

    async def capture_frame(self, frame: object) -> None:
        # frame is an rtc.AudioFrame — record its raw bytes.
        self.frames.append(bytes(frame.data))  # type: ignore[attr-defined]

    def clear_queue(self) -> None:
        self.clears += 1


async def test_audio_sink_captures_frames_and_clears() -> None:
    src = FakeSource()
    sink = LiveKitAudioSink(src)  # type: ignore[arg-type]
    await sink.write(b"\x01\x02\x03\x04")
    await sink.write(b"")  # empty is ignored
    await sink.clear()

    assert src.frames == [b"\x01\x02\x03\x04"]
    assert src.clears == 1


async def test_audio_sink_carries_odd_bytes_across_writes() -> None:
    # TTS chunks may have an odd byte count; frames must stay int16-aligned.
    src = FakeSource()
    sink = LiveKitAudioSink(src)  # type: ignore[arg-type]
    await sink.write(b"\x01\x02\x03")  # 3 bytes → emit 2, carry 1
    await sink.write(b"\x04\x05")  # carry+2 = 3 → emit 2, carry 1
    assert src.frames == [b"\x01\x02", b"\x03\x04"]
    await sink.clear()  # drops the carried byte
    await sink.write(b"\x06\x07")
    assert src.frames[-1] == b"\x06\x07"


async def test_audio_sink_builds_a_16k_mono_frame() -> None:
    src = FakeSource()
    captured: list[object] = []

    async def capture(frame: object) -> None:
        captured.append(frame)

    src.capture_frame = capture  # type: ignore[method-assign]
    await LiveKitAudioSink(src).write(b"\x00\x00\x00\x00")  # type: ignore[arg-type]

    frame = captured[0]
    assert frame.sample_rate == 16_000  # type: ignore[attr-defined]
    assert frame.num_channels == 1  # type: ignore[attr-defined]
    assert frame.samples_per_channel == 2  # 4 bytes / 2 = 2 samples  # type: ignore[attr-defined]


async def test_caller_audio_iterates_then_ends_on_close() -> None:
    caller = CallerAudio()
    caller._queue.put_nowait(b"aa")
    caller._queue.put_nowait(b"bb")
    caller.close()  # pushes the sentinel

    got = [frame async for frame in caller.__aiter__()]
    assert got == [b"aa", b"bb"]


async def test_caller_audio_close_unblocks_a_waiting_iterator() -> None:
    caller = CallerAudio()

    async def consume() -> list[bytes]:
        return [f async for f in caller.__aiter__()]

    task = asyncio.create_task(consume())
    await asyncio.sleep(0)  # let it block on an empty queue
    caller.close()
    assert await asyncio.wait_for(task, timeout=1.0) == []
