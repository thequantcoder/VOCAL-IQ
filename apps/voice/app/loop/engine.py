"""ConversationLoop — the real-time STT→LLM→TTS engine (CODE-PATTERNS §9).

One instance drives one call. It is transport-agnostic: caller audio comes in as PCM16
frames from an async iterator, agent audio goes out through an injected `AudioSink`.
Everything else (STT/LLM/TTS providers, event sink, usage meter, transcript persister,
clock) is injected, so the whole loop runs deterministically in tests without live keys
and against the real adapters + a LiveKit transport in production.

Design notes:
- Frames drive the cadence: each frame updates VAD + the endpointer, which decides when
  the caller's turn ends. STT events arrive asynchronously and feed transcript text.
- The agent turn runs as a *concurrent task* so the frame loop keeps watching for
  barge-in: caller speech during agent audio cancels the in-flight turn, clears the
  output buffer, and returns to listening — the #1 naturalness factor.
- Every provider call is metered (STT seconds, LLM tokens≈, TTS chars) and attributed to
  the tenant + call (golden rule #4). LLM token counts are approximated from text on the
  streaming path; the cost engine reconciles exact usage later.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol

from app.loop.chunker import SentenceChunker
from app.loop.context import ConversationContext, approx_tokens
from app.loop.emotion import (
    DEFAULT_POLICY,
    EmotionPolicy,
    classify_tone,
    estimate_sentiment,
    resolve_expressive_settings,
)
from app.loop.endpointer import Endpointer
from app.loop.metrics import TurnMetrics, new_turn
from app.loop.pci import DisabledPciCapture, PciCapture, PciCaptureResult, strip_card_data
from app.providers.contracts import ExpressiveSettings, LLMProvider, STTProvider, TTSProvider
from app.providers.pricing import llm_cost_usd, stt_cost_usd, tts_cost_usd


class AudioSink(Protocol):
    """Where agent audio goes (a LiveKit track in prod, a buffer in tests)."""

    async def write(self, pcm16: bytes) -> None: ...
    async def clear(self) -> None: ...


@dataclass(slots=True)
class UsageEvent:
    provider: str
    capability: str
    units: float
    cost_usd: float
    byok: bool


EventCallback = Callable[[str, dict[str, object]], Awaitable[None]]
MeterCallback = Callable[[UsageEvent], Awaitable[None]]
TranscriptCallback = Callable[[str, str], Awaitable[None]]


@dataclass(slots=True)
class LoopConfig:
    tenant_id: str
    call_id: str
    agent_id: str
    system_prompt: str = "You are a helpful, concise voice assistant. Keep replies short."
    model: str = "gpt-4o-mini"
    voice_id: str | None = None
    tts_model: str = "eleven_turbo_v2_5"
    stt_model: str = "nova-3"
    language: str | None = None
    byok: bool = False
    greeting: str | None = None
    emotion_policy: EmotionPolicy | None = None  # Day 77: emotion-aware voice modulation (None = neutral)
    turn_timeout_ms: float = 700.0
    frame_ms: float = 20.0
    vad_threshold: float = 500.0
    max_context_tokens: int = 2000
    barge_in: bool = True


async def _noop_event(_type: str, _data: dict[str, object]) -> None: ...
async def _noop_meter(_usage: UsageEvent) -> None: ...
async def _noop_transcript(_role: str, _text: str) -> None: ...


class ConversationLoop:
    def __init__(
        self,
        *,
        stt: STTProvider,
        llm: LLMProvider,
        tts: TTSProvider,
        audio_out: AudioSink,
        config: LoopConfig,
        emit: EventCallback = _noop_event,
        meter: MeterCallback = _noop_meter,
        persist: TranscriptCallback = _noop_transcript,
        pci: PciCapture | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._audio_out = audio_out
        self._cfg = config
        self._emit = emit
        self._meter = meter
        self._persist = persist
        self._pci = pci or DisabledPciCapture()
        self._clock = clock

        from app.loop.vad import VoiceActivityDetector

        self._vad = VoiceActivityDetector(threshold=config.vad_threshold)
        self._endpointer = Endpointer(turn_timeout_ms=config.turn_timeout_ms, clock=clock)
        self._context = ConversationContext(config.system_prompt, max_tokens=config.max_context_tokens)

        self._stt_in: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._agent_speaking = False
        self._interrupt = asyncio.Event()
        self._turn_task: asyncio.Task[None] | None = None
        self._utterance_audio_ms = 0.0
        self.turns: list[TurnMetrics] = []  # exposed for latency assertions/inspection

        # Emotion-aware voice modulation (Day 77). `_tts_settings` is the expressive settings for the
        # NEXT spoken line; None ⇒ neutral. It's refreshed from the caller's mood each turn.
        self._emotion = config.emotion_policy or DEFAULT_POLICY
        self._tts_settings: ExpressiveSettings | None = None

        # PCI-safe pay-by-voice (Day 78). During secure capture, caller transcript is suppressed;
        # at all times any spoken card number is scrubbed before it can be persisted/emitted.
        self._secure = False

    # ── public API ────────────────────────────────────────────────────────────

    async def run(self, audio_in: AsyncIterator[bytes]) -> None:
        """Drive the call until the caller audio stream ends."""
        stt_task = asyncio.create_task(self._consume_stt())
        try:
            if self._cfg.greeting:
                await self._speak_standalone(self._cfg.greeting)
            self._endpointer.mark_idle()
            async for frame in audio_in:
                await self._on_frame(frame)
        finally:
            await self._stt_in.put(None)  # end the STT generator
            await self._cancel_turn()
            with contextlib.suppress(asyncio.CancelledError):
                await stt_task

    async def take_payment(
        self, *, amount_cents: int, currency: str = "USD", description: str = ""
    ) -> PciCaptureResult:
        """Take a card payment (Day 78). Enters secure capture: the caller's card is captured by the
        PCI provider (VocalIQ never sees the PAN) while the loop suppresses the caller transcript for
        the window. Emits `secure.capture.start/end` (amount only — no card data). Returns the
        provider result (token + last4 + status); raises PciCaptureError when no provider is set."""
        self._secure = True
        await self._emit(
            "secure.capture.start", {"amount_cents": amount_cents, "currency": currency}
        )
        status = "failed"
        try:
            result = await self._pci.capture_and_charge(
                amount_cents=amount_cents, currency=currency, description=description
            )
            status = result.status
            return result
        finally:
            self._secure = False
            await self._emit("secure.capture.end", {"status": status})

    # ── frame path (VAD, barge-in, endpointing) ────────────────────────────────

    async def _on_frame(self, frame: bytes) -> None:
        was_speech = self._vad.is_speech
        speech = self._vad.process(frame)
        if speech and not was_speech:
            self._endpointer.on_speech()
            if self._agent_speaking and self._cfg.barge_in:
                await self._barge_in()
        elif not speech and was_speech:
            self._endpointer.on_silence()

        if not self._agent_speaking:
            self._utterance_audio_ms += self._cfg.frame_ms

        self._stt_in.put_nowait(frame)

        utterance = self._endpointer.poll()
        if utterance and not self._agent_speaking:
            self._start_turn(utterance)

    async def _barge_in(self) -> None:
        self._interrupt.set()
        await self._audio_out.clear()
        await self._cancel_turn()
        await self._emit("agent.interrupted", {"call_id": self._cfg.call_id})

    # ── STT consumption ────────────────────────────────────────────────────────

    async def _consume_stt(self) -> None:
        async def frames() -> AsyncIterator[bytes]:
            while True:
                frame = await self._stt_in.get()
                if frame is None:
                    return
                yield frame

        async for event in self._stt.transcribe_stream(
            frames(), model=self._cfg.stt_model, interim_results=True
        ):
            self._endpointer.on_transcript(event.transcript, is_final=event.is_final)
            # During secure capture, don't stream the caller's transcript at all (they may be reading
            # out a card). Otherwise scrub any spoken card number before it leaves the loop (Day 78).
            if self._secure:
                continue
            await self._emit(
                "transcript.partial",
                {"text": strip_card_data(event.transcript), "is_final": event.is_final, "role": "user"},
            )

    # ── agent turn ──────────────────────────────────────────────────────────────

    def _start_turn(self, utterance: str) -> None:
        self._agent_speaking = True
        self._interrupt.clear()
        seconds = self._utterance_audio_ms / 1000
        self._utterance_audio_ms = 0.0
        self._turn_task = asyncio.create_task(self._run_turn(utterance, seconds))
        self._turn_task.add_done_callback(self._on_turn_done)

    def _on_turn_done(self, _task: asyncio.Task[None]) -> None:
        self._agent_speaking = False
        self._endpointer.mark_idle()

    async def _run_turn(self, utterance: str, stt_seconds: float) -> None:
        metrics = new_turn(self._clock)
        await self._meter_stt(stt_seconds)
        # PCI (Day 78): a spoken card number must never reach a transcript store, event, log, or the
        # LLM context. Scrub it here, once, so every downstream sink sees only the redacted text.
        safe = strip_card_data(utterance)
        await self._emit("user.turn", {"text": safe})
        await self._persist("user", safe)
        self._context.add_user(safe)
        await self._tune_voice(safe)

        await self._emit("agent.speaking", {"state": True})
        reply = await self._respond(metrics)
        if not self._interrupt.is_set():
            self._context.add_assistant(reply)
            await self._persist("assistant", reply)
        metrics.completed_at = self._clock()
        self.turns.append(metrics)
        await self._emit("agent.speaking", {"state": False})
        await self._emit("turn.metrics", dict(metrics.as_dict()))

    async def _respond(self, metrics: TurnMetrics) -> str:
        chunker = SentenceChunker()
        spoken: list[str] = []
        produced: list[str] = []
        try:
            async for token in self._llm.stream(self._context.messages(), model=self._cfg.model):
                if self._interrupt.is_set():
                    break
                if metrics.first_token_at is None:
                    metrics.first_token_at = self._clock()
                produced.append(token)
                for chunk in chunker.push(token):
                    await self._speak_chunk(chunk, metrics)
                    spoken.append(chunk)
                    if self._interrupt.is_set():
                        break
            if not self._interrupt.is_set():
                tail = chunker.flush()
                if tail:
                    await self._speak_chunk(tail, metrics)
                    spoken.append(tail)
        finally:
            await self._meter_llm(produced)
        return " ".join(spoken)

    async def _tune_voice(self, utterance: str) -> None:
        """Emotion-aware modulation (Day 77): estimate the caller's mood from their turn and set the
        expressive settings for the agent's next line. Pure + local — no network, no model call, so
        it adds no latency (self-audit F). A no-op (voice stays neutral) unless the agent opted in."""
        if not self._emotion.enabled:
            return
        signal = estimate_sentiment(utterance)
        tone = classify_tone(signal, self._emotion)
        settings = resolve_expressive_settings(tone, self._emotion)
        self._tts_settings = settings
        await self._emit(
            "emotion.modulation",
            {
                "tone": tone,
                "stability": round(settings.stability, 3),
                "style": round(settings.style, 3),
                "speed": round(settings.speed, 3),
            },
        )

    async def _speak_chunk(self, text: str, metrics: TurnMetrics) -> None:
        try:
            async for audio in self._tts.synthesize_stream(
                text,
                voice_id=self._cfg.voice_id,
                model=self._cfg.tts_model,
                settings=self._tts_settings,
            ):
                if self._interrupt.is_set():
                    return
                if metrics.first_audio_at is None:
                    metrics.first_audio_at = self._clock()
                await self._audio_out.write(audio)
        finally:
            await self._meter_tts(text)

    async def _speak_standalone(self, text: str) -> None:
        """Speak a line that is not a response to a user turn (greeting/backstop)."""
        self._agent_speaking = True
        metrics = new_turn(self._clock)
        await self._emit("agent.speaking", {"state": True})
        await self._persist("assistant", text)
        chunker = SentenceChunker()
        for chunk in [*chunker.push(text), chunker.flush() or ""]:
            if chunk:
                await self._speak_chunk(chunk, metrics)
        self._context.add_assistant(text)
        self._agent_speaking = False
        await self._emit("agent.speaking", {"state": False})

    # ── metering (golden rule #4) ───────────────────────────────────────────────

    async def _meter_stt(self, seconds: float) -> None:
        if seconds <= 0:
            return
        await self._meter(
            UsageEvent(
                provider=self._stt.provider,
                capability="stt",
                units=seconds,
                cost_usd=stt_cost_usd(self._cfg.stt_model, seconds),
                byok=self._cfg.byok,
            )
        )

    async def _meter_llm(self, produced: list[str]) -> None:
        out_text = "".join(produced)
        if not out_text:
            return
        in_tokens = sum(approx_tokens(m.content) for m in self._context.messages())
        out_tokens = approx_tokens(out_text)
        await self._meter(
            UsageEvent(
                provider=self._llm.provider,
                capability="llm",
                units=in_tokens + out_tokens,
                cost_usd=llm_cost_usd(self._cfg.model, in_tokens, out_tokens),
                byok=self._cfg.byok,
            )
        )

    async def _meter_tts(self, text: str) -> None:
        chars = len(text)
        if chars == 0:
            return
        await self._meter(
            UsageEvent(
                provider=self._tts.provider,
                capability="tts",
                units=chars,
                cost_usd=tts_cost_usd(self._cfg.tts_model, chars),
                byok=self._cfg.byok,
            )
        )

    async def _cancel_turn(self) -> None:
        task = self._turn_task
        if task is not None and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._turn_task = None
