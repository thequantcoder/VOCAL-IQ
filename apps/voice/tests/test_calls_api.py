import jwt
from fastapi.testclient import TestClient

from app.calls import router as calls_router
from app.calls.livekit_service import LiveKitRoomService
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


def test_start_call_with_livekit_keys_creates_room_and_mints_tokens(monkeypatch) -> None:
    monkeypatch.setattr(settings, "livekit_url", "wss://x.livekit.cloud")
    monkeypatch.setattr(settings, "livekit_api_key", "APIkey")
    monkeypatch.setattr(settings, "livekit_api_secret", "secret")

    # Don't touch the network: stub the live room ops.
    created: list[str] = []

    async def fake_create(self: LiveKitRoomService, name: str) -> str:
        created.append(name)
        return name

    monkeypatch.setattr(LiveKitRoomService, "create_room", fake_create)

    res = client.post(
        "/calls/start", json={"tenant_id": "t1", "agent_id": "a1", "direction": "INBOUND", "channel": "PSTN"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "RINGING"
    assert body["tokens"] is not None
    assert body["tokens"]["server_url"] == "wss://x.livekit.cloud"
    assert created == [body["room"]]  # the room was provisioned
    # Agent token is a valid LiveKit JWT scoped to this call's room.
    claims = jwt.decode(body["tokens"]["agent"], "secret", algorithms=["HS256"])
    assert claims["video"]["room"] == body["room"]
    assert claims["metadata"] == "a1"
    # Lifecycle events were emitted for this call.
    types = [e.type for e in calls_router.events.history(body["call_id"])]
    assert types == ["call.queued", "call.ringing"]


def test_start_call_returns_502_when_room_provisioning_fails(monkeypatch) -> None:
    monkeypatch.setattr(settings, "livekit_url", "wss://x.livekit.cloud")
    monkeypatch.setattr(settings, "livekit_api_key", "APIkey")
    monkeypatch.setattr(settings, "livekit_api_secret", "secret")

    async def boom(self: LiveKitRoomService, name: str) -> str:
        raise RuntimeError("livekit down")

    monkeypatch.setattr(LiveKitRoomService, "create_room", boom)

    res = client.post("/calls/start", json={"tenant_id": "t1", "agent_id": "a1"})
    assert res.status_code == 502


def test_start_call_validates_request() -> None:
    res = client.post("/calls/start", json={"tenant_id": "", "agent_id": "a1"})
    assert res.status_code == 422  # empty tenant_id rejected by Pydantic
