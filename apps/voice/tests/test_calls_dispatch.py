"""Increment #2 — the internal `/calls/dispatch` endpoint (auth + capability gating + agent
launch into an existing room). The agent run + LiveKit network are mocked, so this runs on any
Python; the real join is the gated live check (needs LiveKit + Deepgram/OpenAI/ElevenLabs)."""

from __future__ import annotations

import jwt
from fastapi.testclient import TestClient

from app.calls import router as calls_router
from app.config import settings
from app.loop.engine import LoopConfig
from app.main import app

client = TestClient(app)
SECRET = "internal-secret-xyz"


def _configure(monkeypatch, *, secret: str | None = SECRET, livekit: bool = True, ai: bool = True) -> None:
    monkeypatch.setattr(settings, "voice_internal_secret", secret)
    monkeypatch.setattr(settings, "livekit_url", "wss://x.livekit.cloud" if livekit else None)
    monkeypatch.setattr(settings, "livekit_api_key", "APIkey" if livekit else None)
    monkeypatch.setattr(settings, "livekit_api_secret", "secret" if livekit else None)
    for key in ("deepgram_api_key", "openai_api_key", "elevenlabs_api_key"):
        monkeypatch.setattr(settings, key, "k" if ai else None)


def _body() -> dict[str, str]:
    return {"call_id": "webcid.1", "tenant_id": "t1", "agent_id": "a1", "room": "web-webcid.1"}


def test_dispatch_gated_503_when_internal_secret_unset(monkeypatch) -> None:
    _configure(monkeypatch, secret=None)
    res = client.post("/calls/dispatch", json=_body(), headers={"X-Internal-Secret": "x"})
    assert res.status_code == 503


def test_dispatch_401_on_wrong_or_missing_secret(monkeypatch) -> None:
    _configure(monkeypatch)
    assert (
        client.post("/calls/dispatch", json=_body(), headers={"X-Internal-Secret": "wrong"}).status_code
        == 401
    )
    assert client.post("/calls/dispatch", json=_body()).status_code == 401


def test_dispatch_no_agent_when_voice_ai_unconfigured(monkeypatch) -> None:
    _configure(monkeypatch, ai=False)
    res = client.post("/calls/dispatch", json=_body(), headers={"X-Internal-Secret": SECRET})
    assert res.status_code == 200
    body = res.json()
    assert body["dispatched"] is False
    assert "no agent" in body["note"]


def test_dispatch_no_agent_when_livekit_unconfigured(monkeypatch) -> None:
    _configure(monkeypatch, livekit=False)
    res = client.post("/calls/dispatch", json=_body(), headers={"X-Internal-Secret": SECRET})
    assert res.status_code == 200
    assert res.json()["dispatched"] is False


def test_dispatch_launches_agent_into_the_visitors_room(monkeypatch) -> None:
    _configure(monkeypatch)
    captured: dict[str, object] = {}

    def fake_run_agent(*, config: LoopConfig, token: str, **_kw: object) -> object:
        captured["config"] = config
        captured["token"] = token

        async def _noop() -> None:
            return None

        return _noop()

    monkeypatch.setattr(calls_router.livekit_agent, "run_agent", fake_run_agent)
    res = client.post("/calls/dispatch", json=_body(), headers={"X-Internal-Secret": SECRET})
    assert res.status_code == 200
    assert res.json()["dispatched"] is True

    cfg = captured["config"]
    assert isinstance(cfg, LoopConfig)
    assert (cfg.call_id, cfg.agent_id, cfg.tenant_id) == ("webcid.1", "a1", "t1")
    # The agent's join token must grant the visitor's EXACT room (they must share it to talk).
    claims = jwt.decode(str(captured["token"]), options={"verify_signature": False})
    assert claims["video"]["room"] == "web-webcid.1"
