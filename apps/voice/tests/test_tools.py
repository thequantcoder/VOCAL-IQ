"""Tool + Webhook execution engine (Day 19) — SSRF, validation, retry, signing (offline)."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import pytest

from app.tools import (
    SsrfError,
    ToolError,
    ToolExecutor,
    WebhookExecutor,
    is_safe_url,
    validate_args,
)

PUBLIC = ["93.184.216.34"]  # example.com


def public_resolver(_host: str) -> list[str]:
    return PUBLIC


# ── SSRF guard (self-audit C) ─────────────────────────────────────────────────


def test_ssrf_blocks_internal_and_metadata_addresses() -> None:
    for url in [
        "http://127.0.0.1/x",
        "http://localhost/x",
        "http://10.0.0.5/x",
        "http://192.168.1.1/x",
        "http://169.254.169.254/latest/meta-data",  # cloud metadata
        "http://[::1]/x",
        "file:///etc/passwd",
        "ftp://example.com/x",
    ]:
        ok, _reason = is_safe_url(url, resolver=lambda _h: ["127.0.0.1"])
        assert ok is False, url


def test_ssrf_allows_a_public_https_host() -> None:
    ok, _ = is_safe_url("https://example.com/webhook", resolver=public_resolver)
    assert ok is True


def test_ssrf_blocks_a_hostname_that_resolves_internal() -> None:
    ok, reason = is_safe_url("http://sneaky.example/x", resolver=lambda _h: ["169.254.169.254"])
    assert ok is False
    assert "blocked" in reason


# ── Argument validation ───────────────────────────────────────────────────────

SCHEMA = {
    "properties": {"city": {"type": "string"}, "days": {"type": "integer"}},
    "required": ["city"],
}


def test_validate_args_accepts_valid_and_rejects_bad() -> None:
    assert validate_args(SCHEMA, {"city": "Paris", "days": 3}) == {"city": "Paris", "days": 3}
    with pytest.raises(ToolError):
        validate_args(SCHEMA, {"days": 3})  # missing required
    with pytest.raises(ToolError):
        validate_args(SCHEMA, {"city": "Paris", "days": "three"})  # wrong type
    with pytest.raises(ToolError):
        validate_args(SCHEMA, {"city": "Paris", "days": True})  # bool is not integer
    with pytest.raises(ToolError):
        validate_args(SCHEMA, {"city": "Paris", "extra": 1})  # unexpected arg


# ── HTTP fakes ────────────────────────────────────────────────────────────────


class FakeResponse:
    def __init__(self, status: int, data: Any) -> None:
        self.status_code = status
        self._data = data

    def json(self) -> Any:
        return self._data


class FakeClient:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self._responses = responses
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self) -> FakeClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"method": method, "url": url, **kwargs})
        return self._responses[min(len(self.calls) - 1, len(self._responses) - 1)]


# ── ToolExecutor ──────────────────────────────────────────────────────────────


async def test_tool_execute_validates_calls_and_returns_result() -> None:
    client = FakeClient([FakeResponse(200, {"temp": 21})])
    ex = ToolExecutor(client_factory=lambda: client, resolver=public_resolver)
    result = await ex.execute(
        endpoint="https://example.com/weather",
        method="POST",
        args={"city": "Paris"},
        params_schema=SCHEMA,
    )
    assert result.ok is True
    assert result.data == {"temp": 21}
    assert client.calls[0]["json"] == {"city": "Paris"}


async def test_tool_execute_refuses_ssrf_before_calling() -> None:
    client = FakeClient([FakeResponse(200, {})])
    ex = ToolExecutor(client_factory=lambda: client)  # default resolver; literal internal IP
    with pytest.raises(SsrfError):
        await ex.execute(endpoint="http://169.254.169.254/", method="GET", args={})
    assert client.calls == []  # nothing was sent


async def test_tool_execute_retries_on_5xx() -> None:
    client = FakeClient([FakeResponse(500, None), FakeResponse(200, {"ok": True})])
    ex = ToolExecutor(client_factory=lambda: client, resolver=public_resolver, retries=2)
    result = await ex.execute(endpoint="https://example.com/x", method="GET", args={})
    assert result.status == 200
    assert len(client.calls) == 2  # retried once


# ── WebhookExecutor ───────────────────────────────────────────────────────────


async def test_webhook_signs_the_payload() -> None:
    client = FakeClient([FakeResponse(204, None)])
    ex = WebhookExecutor(client_factory=lambda: client, resolver=public_resolver)
    payload = {"event": "lead.captured", "name": "Ada"}
    out = await ex.send(url="https://example.com/hook", payload=payload, secret="s3cr3t")

    body = json.dumps(payload, separators=(",", ":"))
    expected = hmac.new(b"s3cr3t", body.encode(), hashlib.sha256).hexdigest()
    assert out["status"] == 204
    assert out["signature"] == expected
    assert client.calls[0]["headers"]["x-vocaliq-signature"] == expected


async def test_webhook_refuses_ssrf() -> None:
    client = FakeClient([FakeResponse(204, None)])
    ex = WebhookExecutor(client_factory=lambda: client)
    with pytest.raises(SsrfError):
        await ex.send(url="http://10.1.2.3/hook", payload={})
    assert client.calls == []
