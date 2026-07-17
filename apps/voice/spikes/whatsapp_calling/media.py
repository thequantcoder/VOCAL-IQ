"""WAC-00 spike — throwaway aiortc answerer that proves the WhatsApp media path.

⚠️ NOT product code. This exists only to de-risk the single biggest unknown in the module
(the WebRTC/SRTP/OPUS media plane) against real Meta infra on a test number, and to capture the
real SDP/ICE/DTLS/timing facts into the findings runbook. The production bridge is WAC-03
(`app/telephony/whatsapp_webrtc.py`).

Flow proven here: caller SDP **offer** → build an `RTCPeerConnection`, add an OPUS test-tone track,
generate the SDP **answer**, run ICE + DTLS, decode the caller's audio to a WAV. Requires aiortc
(`pip install '.[dev]'` pulls it via the core dep); run only with the WAC-00 test creds + a tunnel.
"""

from __future__ import annotations

import fractions
import math

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRecorder
from aiortc.mediastreams import MediaStreamTrack
from av import AudioFrame

# Meta negotiates OPUS at 48 kHz (payload 111). 20 ms frame = 960 samples/channel @ 48 kHz.
SAMPLE_RATE = 48_000
FRAME_SAMPLES = 960


class ToneTrack(MediaStreamTrack):
    """A steady sine tone as an OPUS-encodable audio track — the business side's test audio.

    Proves the answer→accept→media path: if the caller hears this tone, SRTP is flowing from the
    business leg. `recv()` returns 20 ms s16 mono frames; aiortc encodes them to OPUS on the wire.
    """

    kind = "audio"

    def __init__(self, freq: float = 440.0) -> None:
        super().__init__()
        self._freq = freq
        self._pts = 0

    async def recv(self) -> AudioFrame:
        samples = bytearray()
        for n in range(FRAME_SAMPLES):
            t = (self._pts + n) / SAMPLE_RATE
            value = int(0.25 * 32767 * math.sin(2 * math.pi * self._freq * t))
            samples += int(value).to_bytes(2, "little", signed=True)

        frame = AudioFrame(format="s16", layout="mono", samples=FRAME_SAMPLES)
        frame.planes[0].update(bytes(samples))
        frame.sample_rate = SAMPLE_RATE
        frame.pts = self._pts
        frame.time_base = fractions.Fraction(1, SAMPLE_RATE)
        self._pts += FRAME_SAMPLES
        return frame


async def answer_offer(sdp_offer: str, record_to: str | None = None) -> tuple[RTCPeerConnection, str]:
    """Answer a caller's SDP offer: attach the tone track (+ optional caller-audio recorder),
    negotiate, and return the peer + the SDP **answer** to hand back to Meta via `pre_accept`.

    ICE gathering is awaited so the returned answer carries candidates (non-trickle) — simplest
    against Meta. The caller MUST stay referenced until terminate (else the peer is GC'd)."""
    pc = RTCPeerConnection()
    pc.addTrack(ToneTrack())

    recorder = MediaRecorder(record_to) if record_to else None

    @pc.on("track")
    def _on_track(track: MediaStreamTrack) -> None:
        # Prove we can DECODE the caller's OPUS: write it to a WAV.
        if recorder is not None and track.kind == "audio":
            recorder.addTrack(track)

    await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp_offer, type="offer"))
    if recorder is not None:
        await recorder.start()

    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    # `localDescription` now holds the gathered ICE candidates.
    assert pc.localDescription is not None
    return pc, pc.localDescription.sdp
