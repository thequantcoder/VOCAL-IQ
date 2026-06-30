import jwt
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_start_call_without_livekit_keys_rings_and_notes_pending(monkeypatch) -> None:
    monkeypatch.setattr(settings, "livekit_api_key", None)
    monkeypatch.setattr(settings, "livekit_url", None)

    res = client.post("/calls/start", json={"tenant_id": "t1", "agent_id": "a1", "channel": "WEB"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "RINGING"
    assert body["tokens"] is None
    assert "LiveKit keys not configured" in body["note"]
    assert body["room"] == f"call-{body['call_id']}"


def test_start_call_with_livekit_keys_mints_tokens(monkeypatch) -> None:
    monkeypatch.setattr(settings, "livekit_url", "wss://x.livekit.cloud")
    monkeypatch.setattr(settings, "livekit_api_key", "APIkey")
    monkeypatch.setattr(settings, "livekit_api_secret", "secret")

    res = client.post(
        "/calls/start", json={"tenant_id": "t1", "agent_id": "a1", "direction": "INBOUND", "channel": "PSTN"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "RINGING"
    assert body["tokens"] is not None
    # Agent token is a valid LiveKit JWT scoped to this call's room.
    claims = jwt.decode(body["tokens"]["agent"], "secret", algorithms=["HS256"])
    assert claims["video"]["room"] == body["room"]
    assert claims["metadata"] == "a1"


def test_start_call_validates_request() -> None:
    res = client.post("/calls/start", json={"tenant_id": "", "agent_id": "a1"})
    assert res.status_code == 422  # empty tenant_id rejected by Pydantic
