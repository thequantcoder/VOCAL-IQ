"""Transport-neutral WebRTC ↔ AI-loop audio adapters — shared by every WebRTC calling channel.

The `ConversationLoop` speaks PCM16 mono @ 16 kHz: it consumes an `AsyncIterator[bytes]` and writes to
an `AudioSink` (`.write()` / `.clear()`). These two adapters bind that contract to ANY WebRTC peer
(WhatsApp Calling, Messenger Calling, …) WITHOUT importing aiortc — the aiortc glue feeds the caller
iterator with already-resampled 16 kHz PCM and drains the sink for the outbound track. Keeping this pure
makes every channel's bridge unit-testable with no native media stack (mirrors LiveKit's
`CallerAudio`/`LiveKitAudioSink`). Originally the WhatsApp adapters (WAC-03); generalized at MEC-03 so
WhatsApp + Messenger share one implementation (`whatsapp_audio.py` re-exports these for stable names).
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator

SAMPLE_RATE = 16_000
NUM_CHANNELS = 1
FRAME_MS = 20
# 16 kHz mono s16 → 320 samples / 640 bytes per 20 ms frame.
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000
FRAME_BYTES = FRAME_SAMPLES * 2


class WebRtcCallerAudio:
    """WebRTC peer → engine: an async iterator of the caller's PCM16@16k frames.

    The WebRTC receive pump calls `feed()` with each resampled frame; `close()` ends the iterator
    (on hangup / ICE failure) so the loop terminates cleanly. Bounded queue drops on overflow rather
    than growing unbounded if the loop stalls (same backpressure posture as the LiveKit path).
    """

    def __init__(self, maxsize: int = 200) -> None:
        self._queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=maxsize)
        self._closed = False

    def feed(self, pcm16: bytes) -> None:
        if self._closed or not pcm16:
            return
        with contextlib.suppress(asyncio.QueueFull):
            self._queue.put_nowait(pcm16)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        with contextlib.suppress(asyncio.QueueFull):
            self._queue.put_nowait(None)

    async def __aiter__(self) -> AsyncIterator[bytes]:
        while True:
            frame = await self._queue.get()
            if frame is None:
                return
            yield frame


class WebRtcAudioSink:
    """Engine → WebRTC peer: buffers agent PCM16@16k for the outbound track; `clear()` = barge-in.

    The engine writes TTS audio here (odd-byte chunks carried to stay int16-aligned, like the LiveKit
    sink); the WebRTC send track pulls fixed-size frames via `read()`, which zero-pads to the requested
    length so the business side always emits a frame (Meta requires the first SRTP packet from the
    business, and steady 20 ms frames avoid gaps). `clear()` drops queued audio so a barged-in turn
    goes silent immediately.
    """

    def __init__(self) -> None:
        self._buf = bytearray()
        self._carry = b""

    async def write(self, pcm16: bytes) -> None:
        data = self._carry + pcm16
        if len(data) % 2:
            self._carry = data[-1:]
            data = data[:-1]
        else:
            self._carry = b""
        self._buf += data

    async def clear(self) -> None:
        self._carry = b""
        self._buf.clear()

    def read(self, nbytes: int = FRAME_BYTES) -> bytes:
        """Pull up to `nbytes` of buffered agent audio, zero-padded to exactly `nbytes` (silence idle)."""
        take = min(nbytes, len(self._buf))
        out = bytes(self._buf[:take])
        del self._buf[:take]
        if take < nbytes:
            out += b"\x00" * (nbytes - take)
        return out

    def pending_bytes(self) -> int:
        return len(self._buf)
