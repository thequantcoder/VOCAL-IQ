"""Voice→api transcript reporting (post-call). The HTTP client is injected (no network): a fake
AsyncClient records the request, so we assert the gating, the collected-turn filtering, the exact
endpoint/header/body, and the fail-soft behaviour (a network error never raises into teardown)."""

from __future__ import annotations

from typing import Any

from app.loop.transcript_reporter import TranscriptReporter


class _FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


class _FakeClient:
    """Stands in for httpx.AsyncClient — records posts, returns a canned status."""

    calls: list[dict[str, Any]] = []
    status_code = 200
    raise_error = False

    def __init__(self, **_kwargs: object) -> None: ...

    async def __aenter__(self) -> _FakeClient:
        return self

    async def __aexit__(self, *_exc: object) -> None: ...

    async def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]) -> _FakeResponse:
        if _FakeClient.raise_error:
            raise RuntimeError("api unreachable")
        _FakeClient.calls.append({"url": url, "headers": headers, "json": json})
        return _FakeResponse(_FakeClient.status_code)


def _reporter(**over: object) -> TranscriptReporter:
    kwargs: dict[str, Any] = {
        "tenant_id": "t1",
        "call_id": "c1",
        "api_url": "http://api:3001/",
        "secret": "sek",
        "client_factory": _FakeClient,
    }
    kwargs.update(over)
    return TranscriptReporter(**kwargs)


def _reset() -> None:
    _FakeClient.calls = []
    _FakeClient.status_code = 200
    _FakeClient.raise_error = False


async def test_collects_nonempty_turns_and_posts_on_flush() -> None:
    _reset()
    r = _reporter()
    await r.persist("assistant", "Hi! How can I help?")
    await r.persist("user", "I am Ada, email ada@x.com")
    await r.persist("user", "   ")  # empty/whitespace turns are dropped
    assert r.segment_count == 2

    assert await r.flush() is True
    call = _FakeClient.calls[0]
    assert call["url"] == "http://api:3001/internal/voice/transcript"  # trailing slash normalised
    assert call["headers"]["x-internal-secret"] == "sek"
    assert call["json"] == {
        "call_id": "c1",
        "tenant_id": "t1",
        "segments": [
            {"role": "assistant", "text": "Hi! How can I help?"},
            {"role": "user", "text": "I am Ada, email ada@x.com"},
        ],
    }


async def test_gated_off_without_url_or_secret() -> None:
    _reset()
    for over in ({"api_url": None}, {"secret": None}):
        r = _reporter(**over)
        await r.persist("user", "hello")
        assert r.enabled is False
        assert await r.flush() is False
    assert _FakeClient.calls == []


async def test_flush_noops_with_no_segments() -> None:
    _reset()
    assert await _reporter().flush() is False
    assert _FakeClient.calls == []


async def test_flush_swallows_network_errors_and_non_2xx() -> None:
    _reset()
    _FakeClient.raise_error = True
    r = _reporter()
    await r.persist("user", "hi")
    assert await r.flush() is False  # never raises

    _reset()
    _FakeClient.status_code = 401
    r2 = _reporter()
    await r2.persist("user", "hi")
    assert await r2.flush() is False
