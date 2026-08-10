"""Typed provider contracts — the Python mirror of the TS `LLMProvider`/`TTSProvider`/
`STTProvider`/`TelephonyProvider` interfaces. Adapters in the voice service implement
these Protocols; the call loop (Day 9) wires the live bodies."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol, runtime_checkable

Role = Literal["system", "user", "assistant"]


@dataclass(slots=True)
class LLMMessage:
    role: Role
    content: str


@dataclass(slots=True)
class TokenUsage:
    input_tokens: int
    output_tokens: int


@dataclass(slots=True)
class CompletionResult:
    text: str
    model: str
    usage: TokenUsage


@dataclass(slots=True)
class STTEvent:
    transcript: str
    is_final: bool
    language: str | None = None  # detected language (Day 25), when detect_language is on


@dataclass(slots=True)
class DialResult:
    call_id: str
    status: str


@dataclass(frozen=True, slots=True)
class ExpressiveSettings:
    """Provider-agnostic expressive TTS controls (Day 77). Adapters map these onto their own knobs
    (ElevenLabs → voice_settings). `NEUTRAL` is the professional default; the emotion modulator
    (app.loop.emotion) produces coloured variants from the caller's mood. Mirrors the TS
    `ExpressiveSettings` in @vocaliq/shared so voice + api agree exactly."""

    stability: float = 0.5
    similarity_boost: float = 0.75
    style: float = 0.0
    speed: float = 1.0
    use_speaker_boost: bool = False


NEUTRAL_SETTINGS = ExpressiveSettings()


@runtime_checkable
class LLMProvider(Protocol):
    provider: str
    default_model: str

    async def complete(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        max_tokens: int | None = None,
        system: str | None = None,
    ) -> CompletionResult: ...

    def stream(self, messages: list[LLMMessage], *, model: str | None = None) -> AsyncIterator[str]: ...


@runtime_checkable
class TTSProvider(Protocol):
    provider: str
    default_model: str

    def synthesize_stream(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        model: str | None = None,
        settings: ExpressiveSettings | None = None,
    ) -> AsyncIterator[bytes]: ...


@runtime_checkable
class STTProvider(Protocol):
    provider: str
    default_model: str

    def transcribe_stream(
        self, audio: AsyncIterator[bytes], *, model: str | None = None, interim_results: bool = True
    ) -> AsyncIterator[STTEvent]: ...


@runtime_checkable
class TelephonyProvider(Protocol):
    provider: str

    async def dial(self, to: str, from_: str) -> DialResult: ...
    async def answer(self, call_id: str) -> None: ...
    async def transfer(self, call_id: str, to: str) -> None: ...
    async def hangup(self, call_id: str) -> None: ...
