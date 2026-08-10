"""Deterministic fakes + helpers for the conversation-loop tests (Day 09).

No network, no real timing flakiness: STT events are scripted to frame counts, the LLM
streams a fixed reply token-by-token, TTS emits a byte per chunk, and a buffer captures
agent audio. This lets the full STT→LLM→TTS loop — including barge-in and metering — run
in CI without keys.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.loop.engine import UsageEvent
from app.loop.pci import PciCaptureResult
from app.providers.contracts import (
    CompletionResult,
    ExpressiveSettings,
    LLMMessage,
    STTEvent,
    TokenUsage,
)

# 20ms PCM16 mono @16kHz = 320 samples = 640 bytes.
FRAME_SAMPLES = 320
SPEECH = (b"\x00\x40") * FRAME_SAMPLES  # sample 0x4000 → high RMS
SILENCE = (b"\x00\x00") * FRAME_SAMPLES


class FakeSTT:
    """Emits scripted transcripts after consuming N frames (ties STT to frame flow)."""

    provider = "DEEPGRAM"
    default_model = "nova-3"

    def __init__(self, script: list[tuple[int, str, bool]]) -> None:
        # script: (after_n_frames, transcript, is_final)
        self._script = sorted(script, key=lambda s: s[0])

    async def transcribe_stream(
        self, audio: AsyncIterator[bytes], *, model: str | None = None, interim_results: bool = True
    ) -> AsyncIterator[STTEvent]:
        n = 0
        i = 0
        async for _frame in audio:
            n += 1
            while i < len(self._script) and self._script[i][0] <= n:
                _, text, is_final = self._script[i]
                i += 1
                yield STTEvent(transcript=text, is_final=is_final)
        while i < len(self._script):
            _, text, is_final = self._script[i]
            i += 1
            yield STTEvent(transcript=text, is_final=is_final)


class FakeLLM:
    """Streams a fixed reply token-by-token, with an optional per-token delay."""

    provider = "OPENAI"
    default_model = "gpt-4o-mini"

    def __init__(self, reply: str = "Sure, I can help with that.", *, token_delay: float = 0.0) -> None:
        self._reply = reply
        self._delay = token_delay

    async def complete(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        max_tokens: int | None = None,
        system: str | None = None,
    ) -> CompletionResult:
        return CompletionResult(text=self._reply, model=self.default_model, usage=TokenUsage(1, 1))

    async def stream(
        self, messages: list[LLMMessage], *, model: str | None = None
    ) -> AsyncIterator[str]:
        for word in self._reply.split(" "):
            if self._delay:
                await asyncio.sleep(self._delay)
            yield word + " "


class FailingLLM:
    provider = "OPENAI"
    default_model = "gpt-4o-mini"

    async def complete(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        max_tokens: int | None = None,
        system: str | None = None,
    ) -> CompletionResult:
        raise RuntimeError("llm down")

    async def stream(
        self, messages: list[LLMMessage], *, model: str | None = None
    ) -> AsyncIterator[str]:
        raise RuntimeError("llm stream dropped")
        yield ""  # pragma: no cover — makes this an async generator


class FakeTTS:
    """Emits one audio byte per call so we can prove audio flowed + count syntheses."""

    provider = "ELEVENLABS"
    default_model = "eleven_turbo_v2_5"

    def __init__(self, *, chunk_delay: float = 0.0) -> None:
        self.spoken: list[str] = []
        self.settings: list[ExpressiveSettings | None] = []  # Day 77: expressive settings per synthesis
        self._delay = chunk_delay

    async def synthesize_stream(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        model: str | None = None,
        settings: ExpressiveSettings | None = None,
    ) -> AsyncIterator[bytes]:
        self.spoken.append(text)
        self.settings.append(settings)
        if self._delay:
            await asyncio.sleep(self._delay)
        yield b"\x01\x02"


class FakePci:
    """A configured PCI capture provider for tests — returns a token + last4, never a PAN."""

    enabled = True

    def __init__(self, *, status: str = "succeeded") -> None:
        self.calls: list[tuple[int, str, str]] = []
        self._status = status

    async def capture_and_charge(
        self, *, amount_cents: int, currency: str, description: str = ""
    ) -> PciCaptureResult:
        self.calls.append((amount_cents, currency, description))
        return PciCaptureResult(
            charge_id="ch_test_123", token="tok_test_abc", last4="4242", status=self._status
        )


class BufferSink:
    """Captures agent audio; `clear()` (barge-in) records how many flushes happened."""

    def __init__(self) -> None:
        self.frames: list[bytes] = []
        self.clears = 0

    async def write(self, pcm16: bytes) -> None:
        self.frames.append(pcm16)

    async def clear(self) -> None:
        self.clears += 1
        self.frames.clear()


class Collectors:
    """Gathers emitted events, usage records, and persisted transcript turns."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, object]]] = []
        self.usage: list[UsageEvent] = []
        self.transcript: list[tuple[str, str]] = []

    async def emit(self, type: str, data: dict[str, object]) -> None:
        self.events.append((type, data))

    async def meter(self, usage: UsageEvent) -> None:
        self.usage.append(usage)

    async def persist(self, role: str, text: str) -> None:
        self.transcript.append((role, text))

    def event_types(self) -> list[str]:
        return [t for t, _ in self.events]


class ManualClock:
    """A clock the test advances explicitly, and that auto-advances per frame."""

    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


async def feed(
    frames: list[bytes], clock: ManualClock | None = None, *, frame_s: float = 0.02
) -> AsyncIterator[bytes]:
    """Yield frames one 'frame_s' apart.

    Manual-clock mode (clock given): advance the fake clock and cede control (instant).
    Real-clock mode (clock None): actually sleep frame_s so wall-time accrues for the
    endpointer + latency assertions.
    """
    for frame in frames:
        if clock is not None:
            clock.advance(frame_s)
            yield frame
            await asyncio.sleep(0)
        else:
            yield frame
            await asyncio.sleep(frame_s)
