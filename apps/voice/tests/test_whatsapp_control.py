"""WAC-03 — the internal api→voice control endpoints (auth + gating + wiring), bridge mocked.

No aiortc here: a fake bridge stands in for the media peer, so these run on any Python. The real peer
is exercised only in the gated live check.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.calls import whatsapp_router
from app.config import settings
from app.loop.engine import LoopConfig
from app.main import app

client = TestClient(app)
SECRET = "internal-secret-xyz"


class FakeBridge:
    def __init__(self) -> None:
        self.answered: list[tuple[str, str]] = []
        self.ended: list[str] = []

    async def answer(self, *, call_id: str, sdp_offer: str, config: LoopConfig) -> str:
        self.answered.append((call_id, config.agent_id))
        return "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n(answer)"

    async def end(self, call_id: str) -> None:
        self.ended.append(call_id)


def _configure(monkeypatch, *, secret: str | None = SECRET, ai: bool = True) -> None:
    monkeypatch.setattr(settings, "voice_internal_secret", secret)
    for key in ("deepgram_api_key", "openai_api_key", "elevenlabs_api_key"):
        monkeypatch.setattr(settings, key, "k" if ai else None)


def _body() -> dict[str, str]:
    return {"call_id": "wacid.1", "sdp_offer": "v=0", "tenant_id": "t1", "agent_id": "a1"}


def test_answer_is_gated_503_when_internal_secret_unset(monkeypatch) -> None:
    _configure(monkeypatch, secret=None)
    res = client.post("/calls/whatsapp/answer", json=_body(), headers={"X-Internal-Secret": "x"})
    assert res.status_code == 503


def test_answer_401_on_wrong_or_missing_secret(monkeypatch) -> None:
    _configure(monkeypatch)
    assert client.post("/calls/whatsapp/answer", json=_body(),
                       headers={"X-Internal-Secret": "wrong"}).status_code == 401
    assert client.post("/calls/whatsapp/answer", json=_body()).status_code == 401


def test_answer_503_when_voice_ai_not_configured(monkeypatch) -> None:
    _configure(monkeypatch, ai=False)
    res = client.post("/calls/whatsapp/answer", json=_body(), headers={"X-Internal-Secret": SECRET})
    assert res.status_code == 503


def test_answer_returns_sdp_when_authorized_and_configured(monkeypatch) -> None:
    _configure(monkeypatch)
    fake = FakeBridge()
    monkeypatch.setattr(whatsapp_router, "_bridge", fake)
    res = client.post("/calls/whatsapp/answer", json=_body(), headers={"X-Internal-Secret": SECRET})
    assert res.status_code == 200
    assert res.json()["sdp_answer"].startswith("v=0")
    assert fake.answered == [("wacid.1", "a1")]  # the offer reached the bridge with the agent


def test_end_tears_down_via_bridge(monkeypatch) -> None:
    _configure(monkeypatch)
    fake = FakeBridge()
    monkeypatch.setattr(whatsapp_router, "_bridge", fake)
    res = client.post("/calls/whatsapp/end", json={"call_id": "wacid.1"},
                      headers={"X-Internal-Secret": SECRET})
    assert res.status_code == 200
    assert fake.ended == ["wacid.1"]
