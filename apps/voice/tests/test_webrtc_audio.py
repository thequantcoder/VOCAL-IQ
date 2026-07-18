"""Unit tests for the shared transport-neutral WebRTC audio adapters (MEC-03, generalized from WAC-03).

Pure — no aiortc / native media stack. Proves the buffer/iterator the loop depends on, used by both the
WhatsApp and Messenger media bridges. (The WhatsApp names re-export these, so `test_whatsapp_bridge.py`
covers the same implementation via the aliases.)
"""

from __future__ import annotations

from app.telephony.webrtc_audio import FRAME_BYTES, WebRtcAudioSink, WebRtcCallerAudio


class TestAudioSink:
    async def test_write_buffers_and_read_pulls_exact_frame(self) -> None:
        sink = WebRtcAudioSink()
        await sink.write(b"\x01\x02\x03\x04")
        assert sink.read(4) == b"\x01\x02\x03\x04"

    async def test_read_zero_pads_to_silence_when_idle(self) -> None:
        sink = WebRtcAudioSink()
        assert sink.read(FRAME_BYTES) == b"\x00" * FRAME_BYTES

    async def test_odd_byte_is_carried_to_stay_int16_aligned(self) -> None:
        sink = WebRtcAudioSink()
        await sink.write(b"\x01\x02\x03")  # 3 bytes → 2 buffered, 1 carried
        assert sink.pending_bytes() == 2
        await sink.write(b"\x04")  # carry + this → 2 more
        assert sink.pending_bytes() == 4

    async def test_clear_drops_buffered_audio_on_barge_in(self) -> None:
        sink = WebRtcAudioSink()
        await sink.write(b"\x01\x02\x03\x04")
        await sink.clear()
        assert sink.pending_bytes() == 0
        assert sink.read(2) == b"\x00\x00"


class TestCallerAudio:
    async def test_feeds_then_ends_on_close(self) -> None:
        caller = WebRtcCallerAudio()
        caller.feed(b"aa")
        caller.feed(b"bb")
        caller.feed(b"")  # empty is ignored
        caller.close()
        got = [frame async for frame in caller.__aiter__()]
        assert got == [b"aa", b"bb"]

    async def test_feed_after_close_is_ignored(self) -> None:
        caller = WebRtcCallerAudio()
        caller.close()
        caller.feed(b"late")
        got = [frame async for frame in caller.__aiter__()]
        assert got == []
