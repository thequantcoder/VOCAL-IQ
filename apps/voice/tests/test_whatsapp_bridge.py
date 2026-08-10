"""WAC-03 unit tests for the transport-neutral bridge logic (no aiortc / native media stack).

The aiortc peer itself (`whatsapp_webrtc.py`) is exercised only in the gated live check; here we prove
the pure pieces the loop depends on: the audio buffer/iterator, SDP codec gating, and DTMF decode.
"""

from __future__ import annotations

from app.telephony.whatsapp_audio import FRAME_BYTES, WhatsAppAudioSink, WhatsAppCallerAudio
from app.telephony.whatsapp_dtmf import decode_dtmf_event
from app.telephony.whatsapp_sdp import (
    opus_payload_type,
    sdp_has_opus,
    telephone_event_payload_type,
)

_OFFER = """v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
m=audio 5004 UDP/TLS/RTP/SAVPF 111 101
a=rtpmap:111 opus/48000/2
a=fmtp:111 useinbandfec=1
a=rtpmap:101 telephone-event/8000
"""


class TestAudioSink:
    async def test_write_buffers_and_read_pulls_exact_frame(self) -> None:
        sink = WhatsAppAudioSink()
        await sink.write(b"\x01\x02\x03\x04")
        got = sink.read(4)
        assert got == b"\x01\x02\x03\x04"

    async def test_read_zero_pads_to_silence_when_idle(self) -> None:
        sink = WhatsAppAudioSink()
        # Empty buffer → a full frame of silence (business always emits a frame).
        assert sink.read(FRAME_BYTES) == b"\x00" * FRAME_BYTES

    async def test_odd_byte_is_carried_to_stay_int16_aligned(self) -> None:
        sink = WhatsAppAudioSink()
        await sink.write(b"\x01\x02\x03")  # 3 bytes → 2 buffered, 1 carried
        assert sink.pending_bytes() == 2
        await sink.write(b"\x04")  # carry + this → 2 more
        assert sink.pending_bytes() == 4

    async def test_clear_drops_buffered_audio_on_barge_in(self) -> None:
        sink = WhatsAppAudioSink()
        await sink.write(b"\x01\x02\x03\x04")
        await sink.clear()
        assert sink.pending_bytes() == 0
        assert sink.read(2) == b"\x00\x00"


class TestCallerAudio:
    async def test_feeds_then_ends_on_close(self) -> None:
        caller = WhatsAppCallerAudio()
        caller.feed(b"aa")
        caller.feed(b"bb")
        caller.feed(b"")  # empty is ignored
        caller.close()
        got = [frame async for frame in caller.__aiter__()]
        assert got == [b"aa", b"bb"]

    async def test_feed_after_close_is_ignored(self) -> None:
        caller = WhatsAppCallerAudio()
        caller.close()
        caller.feed(b"late")
        got = [frame async for frame in caller.__aiter__()]
        assert got == []


class TestSdp:
    def test_finds_opus_payload_type(self) -> None:
        assert opus_payload_type(_OFFER) == 111
        assert sdp_has_opus(_OFFER) is True

    def test_no_opus_offer(self) -> None:
        assert opus_payload_type("m=audio 1 RTP/SAVPF 0\na=rtpmap:0 PCMU/8000") is None
        assert sdp_has_opus("") is False

    def test_finds_dtmf_telephone_event_at_8k(self) -> None:
        assert telephone_event_payload_type(_OFFER) == 101
        assert telephone_event_payload_type(_OFFER, clock=48000) is None


class TestDtmf:
    def test_decodes_digit_only_on_end_bit(self) -> None:
        # event 5, End bit set, volume 10, duration 160
        assert decode_dtmf_event(bytes([5, 0x8A, 0x00, 0xA0])) == "5"

    def test_non_terminal_packet_yields_nothing(self) -> None:
        assert decode_dtmf_event(bytes([5, 0x0A, 0x00, 0xA0])) is None  # no End bit

    def test_star_and_hash_and_letters(self) -> None:
        assert decode_dtmf_event(bytes([10, 0x80, 0, 0])) == "*"
        assert decode_dtmf_event(bytes([11, 0x80, 0, 0])) == "#"
        assert decode_dtmf_event(bytes([12, 0x80, 0, 0])) == "A"

    def test_malformed_or_out_of_range(self) -> None:
        assert decode_dtmf_event(b"\x00\x00") is None  # too short
        assert decode_dtmf_event(bytes([99, 0x80, 0, 0])) is None  # event > 15
