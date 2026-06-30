"""Unit + live tests for the voice-service provider adapters (Day 07 Python mirror).

Unit tests fake the transport (httpx / websockets) to exercise the streaming + bridge
logic deterministically. Live smokes hit the real providers and SKIP without keys, so
CI stays green while the path is proven locally."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator

import pytest

from app.providers import DeepgramSTT, ElevenLabsTTS
from app.providers.adapters.elevenlabs import TTSError
from app.providers.contracts import STTProvider, TTSProvider


async def _audio() -> AsyncIterator[bytes]:
    yield b"\x00" * 640


def test_adapters_satisfy_the_protocols() -> None:
    assert isinstance(ElevenLabsTTS("k"), TTSProvider)
    assert isinstance(DeepgramSTT("k"), STTProvider)
    assert ElevenLabsTTS("k").default_model == "eleven_turbo_v2_5"
    assert DeepgramSTT("k").default_model == "nova-3"


# ── ElevenLabs (faked httpx stream) ───────────────────────────────────────────


class _FakeStreamResponse:
    def __init__(self, status_code: int, chunks: list[bytes]) -> None:
        self.status_code = status_code
        self._chunks = chunks

    async def __aenter__(self) -> _FakeStreamResponse:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def aiter_bytes(self) -> AsyncIterator[bytes]:
        for c in self._chunks:
            yield c

    async def aread(self) -> bytes:
        return b"error detail"


class _FakeAsyncClient:
    def __init__(self, status_code: int, chunks: list[bytes]) -> None:
        self._status_code = status_code
        self._chunks = chunks
        self.captured: dict[str, object] = {}

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    def stream(self, method: str, url: str, **kwargs: object) -> _FakeStreamResponse:
        self.captured = {"method": method, "url": url, **kwargs}
        return _FakeStreamResponse(self._status_code, self._chunks)


async def test_elevenlabs_streams_pcm_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeAsyncClient(200, [b"\x01\x02", b"\x03\x04"])
    monkeypatch.setattr("app.providers.adapters.elevenlabs.httpx.AsyncClient", lambda **_: fake)

    chunks = [c async for c in ElevenLabsTTS("k").synthesize_stream("hello", model="eleven_turbo_v2_5")]

    assert chunks == [b"\x01\x02", b"\x03\x04"]
    assert "/text-to-speech/" in str(fake.captured["url"])
    assert fake.captured["json"] == {  # type: ignore[index]
        "text": "hello",
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    assert fake.captured["params"] == {"output_format": "pcm_16000"}  # type: ignore[index]


async def test_elevenlabs_raises_on_non_200(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeAsyncClient(401, [])
    monkeypatch.setattr("app.providers.adapters.elevenlabs.httpx.AsyncClient", lambda **_: fake)
    with pytest.raises(TTSError):
        async for _ in ElevenLabsTTS("k").synthesize_stream("hi"):
            pass


# ── Deepgram (faked websocket) ────────────────────────────────────────────────


class _FakeWS:
    def __init__(self, messages: list[str]) -> None:
        self._messages = messages
        self.sent: list[object] = []

    async def __aenter__(self) -> _FakeWS:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def send(self, data: object) -> None:
        self.sent.append(data)

    def __aiter__(self) -> _FakeWS:
        self._iter = iter(self._messages)
        return self

    async def __anext__(self) -> str:
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration from None


async def test_deepgram_yields_interim_then_final(monkeypatch: pytest.MonkeyPatch) -> None:
    messages = [
        json.dumps({"type": "Results", "is_final": False, "channel": {"alternatives": [{"transcript": "hel"}]}}),
        json.dumps({"type": "Results", "is_final": True, "channel": {"alternatives": [{"transcript": "hello"}]}}),
        json.dumps({"type": "Metadata"}),
    ]
    ws = _FakeWS(messages)
    monkeypatch.setattr("app.providers.adapters.deepgram.websockets.connect", lambda *a, **k: ws)

    events = [e async for e in DeepgramSTT("k").transcribe_stream(_audio())]

    assert [(e.transcript, e.is_final) for e in events] == [("hel", False), ("hello", True)]
    # Audio was forwarded and end-of-stream signalled.
    assert ws.sent[-1] == json.dumps({"type": "CloseStream"})
    assert b"\x00" * 640 in ws.sent


# ── Live smokes (skip without keys) ───────────────────────────────────────────


@pytest.mark.skipif(not os.environ.get("DEEPGRAM_API_KEY"), reason="no DEEPGRAM_API_KEY")
async def test_deepgram_live_socket() -> None:
    key = os.environ["DEEPGRAM_API_KEY"]
    events = [e async for e in DeepgramSTT(key).transcribe_stream(_audio(), interim_results=False)]
    assert isinstance(events, list)  # silence may transcribe to nothing; the path completes


@pytest.mark.skipif(
    os.environ.get("RUN_TTS_SMOKE") != "1" or not os.environ.get("ELEVENLABS_API_KEY"),
    reason="opt-in (spends ElevenLabs characters)",
)
async def test_elevenlabs_live_synth() -> None:
    key = os.environ["ELEVENLABS_API_KEY"]
    total = 0
    async for chunk in ElevenLabsTTS(key).synthesize_stream("hi"):
        total += len(chunk)
    assert total > 0
