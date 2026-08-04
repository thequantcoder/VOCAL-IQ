"""Bridge → transcript-reporter wiring (WhatsApp + Messenger). The bridge modules import aiortc/av,
which the CI test env may not carry (they are pyright-checked and live-exercised) — so this module
skips cleanly when aiortc is absent and runs wherever the media stack is installed. It proves each
bridge's `_run_loop` flushes the reporter at loop end and the ctor threads the reporting config."""

from __future__ import annotations

from typing import Any, cast

import pytest

pytest.importorskip("aiortc")

from app.loop.engine import ConversationLoop  # noqa: E402
from app.loop.transcript_reporter import TranscriptReporter  # noqa: E402
from app.telephony.messenger_webrtc import MessengerMediaBridge  # noqa: E402
from app.telephony.webrtc_audio import WebRtcCallerAudio  # noqa: E402
from app.telephony.whatsapp_audio import WhatsAppCallerAudio  # noqa: E402
from app.telephony.whatsapp_webrtc import WhatsAppMediaBridge  # noqa: E402


class _FakeResponse:
    status_code = 200


class _FakeClient:
    calls: list[dict[str, Any]] = []

    def __init__(self, **_kwargs: object) -> None: ...

    async def __aenter__(self) -> _FakeClient:
        return self

    async def __aexit__(self, *_exc: object) -> None: ...

    async def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]) -> _FakeResponse:
        _FakeClient.calls.append({"url": url, "headers": headers, "json": json})
        return _FakeResponse()


class _FakeLoop:
    async def run(self, _frames: object) -> None:
        return None


class _FakeCaller:
    def __aiter__(self) -> _FakeCaller:
        return self

    async def __anext__(self) -> bytes:
        raise StopAsyncIteration

    def close(self) -> None: ...


def _reporter() -> TranscriptReporter:
    return TranscriptReporter(
        tenant_id="t1",
        call_id="c1",
        api_url="http://api:3001",
        secret="sek",
        client_factory=cast(Any, _FakeClient),
    )


def test_ctors_store_reporting_config() -> None:
    for cls in (WhatsAppMediaBridge, MessengerMediaBridge):
        bridge = cls(
            stt_key="k",
            llm_key="k",
            tts_key="k",
            api_internal_url="http://api:3001",
            internal_secret="sek",
        )
        assert bridge._api_internal_url == "http://api:3001"  # noqa: SLF001
        assert bridge._internal_secret == "sek"  # noqa: SLF001


async def test_wa_run_loop_flushes_reporter_at_loop_end() -> None:
    _FakeClient.calls = []
    bridge = WhatsAppMediaBridge(stt_key="k", llm_key="k", tts_key="k")
    reporter = _reporter()
    await reporter.persist("user", "hi from whatsapp")
    await bridge._run_loop(  # noqa: SLF001
        "c1",
        cast(ConversationLoop, _FakeLoop()),
        cast(WhatsAppCallerAudio, _FakeCaller()),
        reporter,
    )
    assert _FakeClient.calls[0]["json"]["segments"] == [{"role": "user", "text": "hi from whatsapp"}]


async def test_me_run_loop_flushes_reporter_at_loop_end() -> None:
    _FakeClient.calls = []
    bridge = MessengerMediaBridge(stt_key="k", llm_key="k", tts_key="k")
    reporter = _reporter()
    await reporter.persist("assistant", "hello from messenger")
    await bridge._run_loop(  # noqa: SLF001
        "c1",
        cast(ConversationLoop, _FakeLoop()),
        cast(WebRtcCallerAudio, _FakeCaller()),
        reporter,
    )
    assert _FakeClient.calls[0]["json"]["segments"] == [
        {"role": "assistant", "text": "hello from messenger"}
    ]
