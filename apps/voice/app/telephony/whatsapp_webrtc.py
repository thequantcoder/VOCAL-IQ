"""WhatsApp ↔ AI-loop WebRTC media bridge (WAC-03) — the aiortc half (the live media plane).

Terminates a **raw WebRTC peer with Meta** (ICE + DTLS-SRTP, OPUS) per WhatsApp call — NOT the LiveKit
SFU, a P2P leg — and bridges its audio bidirectionally into the SAME `ConversationLoop` that powers
PSTN/web (Deepgram STT → LLM → ElevenLabs TTS), so persona/flow/RAG/memory/tools "just work". The
transport-neutral audio adapters live in `whatsapp_audio.py`; codec/DTMF helpers in `whatsapp_sdp.py`
/ `whatsapp_dtmf.py`. This module is the only one that imports aiortc/av — it is type-checked by CI
(pyright 3.12) and exercised live once the WAC-00 test creds are set; the pure pieces are unit-tested.

Design rules from the WAC-00 findings runbook:
- The agent track always emits 20 ms frames (silence when idle) → the business sends the first SRTP
  packet and there are no media gaps. aiortc's OPUS encoder resamples our 16 kHz frames to 48 kHz.
- Inbound caller frames (48 kHz from the OPUS decoder) are resampled to 16 kHz mono for the loop.
- Every failure (ICE fail / DTLS timeout / hangup) tears the peer down cleanly — never a stuck peer.
"""

from __future__ import annotations

import asyncio
import contextlib
import fractions
import logging
from dataclasses import dataclass, field

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamError, MediaStreamTrack
from av import AudioFrame
from av.audio.resampler import AudioResampler

from app.loop.engine import ConversationLoop, LoopConfig
from app.providers.adapters.deepgram import DeepgramSTT
from app.providers.adapters.elevenlabs import ElevenLabsTTS
from app.providers.adapters.openai import OpenAILLM
from app.telephony.whatsapp_audio import (
    FRAME_BYTES,
    FRAME_MS,
    FRAME_SAMPLES,
    SAMPLE_RATE,
    WhatsAppAudioSink,
    WhatsAppCallerAudio,
)

log = logging.getLogger("voice.whatsapp")


class AgentAudioTrack(MediaStreamTrack):
    """Engine → Meta: 20 ms PCM16@16k frames pulled from the sink (silence when idle).

    aiortc's OPUS encoder resamples these to 48 kHz on the wire, so the loop stays in the 16 kHz PCM it
    already speaks. Steady frames mean the business side always has audio to send (first-SRTP-packet
    rule) with no gaps; `sink.clear()` (barge-in) simply makes upcoming frames silent.
    """

    kind = "audio"

    def __init__(self, sink: WhatsAppAudioSink) -> None:
        super().__init__()
        self._sink = sink
        self._pts = 0

    async def recv(self) -> AudioFrame:
        await asyncio.sleep(FRAME_MS / 1000)  # pace the outbound stream at 20 ms
        pcm16 = self._sink.read(FRAME_BYTES)
        frame = AudioFrame(format="s16", layout="mono", samples=FRAME_SAMPLES)
        frame.planes[0].update(pcm16)
        frame.sample_rate = SAMPLE_RATE
        frame.pts = self._pts
        frame.time_base = fractions.Fraction(1, SAMPLE_RATE)
        self._pts += FRAME_SAMPLES
        return frame


@dataclass
class _Peer:
    pc: RTCPeerConnection
    caller: WhatsAppCallerAudio
    sink: WhatsAppAudioSink
    tasks: list[asyncio.Task[None]] = field(default_factory=list)
    closing: bool = False


class WhatsAppMediaBridge:
    """Manages one aiortc peer + AI loop per WhatsApp call, keyed by call id.

    `answer()` returns the SDP answer for the api to `pre_accept`/`accept`; the loop runs until either
    side hangs up or `end()` is called. Media/keys are injected so the bridge is constructed only when
    the voice-AI providers are configured (else the control endpoint reports gated).
    """

    def __init__(self, *, stt_key: str, llm_key: str, tts_key: str) -> None:
        self._stt_key = stt_key
        self._llm_key = llm_key
        self._tts_key = tts_key
        self._peers: dict[str, _Peer] = {}

    async def answer(self, *, call_id: str, sdp_offer: str, config: LoopConfig) -> str:
        """Build the peer for a caller's SDP offer, start the AI loop, and return the SDP answer.

        ICE is gathered before returning (non-trickle) so the answer Meta receives via `accept` already
        carries candidates. Raises if `call_id` is already bridged (idempotency is the caller's job)."""
        if call_id in self._peers:
            raise ValueError(f"call {call_id} already has a media peer")

        pc = RTCPeerConnection()
        caller = WhatsAppCallerAudio()
        sink = WhatsAppAudioSink()
        peer = _Peer(pc=pc, caller=caller, sink=sink)
        self._peers[call_id] = peer

        pc.addTrack(AgentAudioTrack(sink))

        @pc.on("track")
        def _on_track(track: MediaStreamTrack) -> None:
            if track.kind == "audio":
                peer.tasks.append(asyncio.create_task(self._pump_inbound(track, caller)))

        @pc.on("connectionstatechange")
        async def _on_state() -> None:
            if pc.connectionState in {"failed", "closed", "disconnected"}:
                log.info("wa call %s connection %s", call_id, pc.connectionState)
                await self.end(call_id)

        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp_offer, type="offer"))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        # Start the AI brain — its greeting queues in the sink and plays as soon as media connects.
        loop = ConversationLoop(
            stt=DeepgramSTT(self._stt_key),
            llm=OpenAILLM(self._llm_key),
            tts=ElevenLabsTTS(self._tts_key),
            audio_out=sink,
            config=config,
        )
        peer.tasks.append(asyncio.create_task(self._run_loop(call_id, loop, caller)))

        assert pc.localDescription is not None
        return pc.localDescription.sdp

    async def _pump_inbound(self, track: MediaStreamTrack, caller: WhatsAppCallerAudio) -> None:
        """Decode + resample the caller's OPUS (48 kHz) down to 16 kHz mono and feed the loop."""
        resampler = AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
        try:
            while True:
                frame = await track.recv()
                if not isinstance(frame, AudioFrame):
                    continue  # audio track — ignore any non-audio frame aiortc hands us
                for out in resampler.resample(frame):
                    caller.feed(bytes(out.planes[0]))
        except MediaStreamError:
            pass  # track ended (hangup / ICE loss) — normal teardown
        finally:
            caller.close()

    async def _run_loop(
        self, call_id: str, loop: ConversationLoop, caller: WhatsAppCallerAudio
    ) -> None:
        try:
            await loop.run(caller.__aiter__())
        except Exception:  # never let a loop crash strand the peer
            log.exception("wa loop failed for call %s", call_id)
        finally:
            await self.end(call_id)

    async def end(self, call_id: str) -> None:
        """Tear down a call's peer + loop. Idempotent (safe to call from state change and loop end)."""
        peer = self._peers.pop(call_id, None)
        if peer is None or peer.closing:
            return
        peer.closing = True
        peer.caller.close()
        for task in peer.tasks:
            task.cancel()
        with contextlib.suppress(Exception):
            await peer.pc.close()

    def active(self) -> int:
        return len(self._peers)
