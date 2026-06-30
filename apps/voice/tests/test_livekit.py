import os

import jwt
import pytest

from app.calls.livekit_service import LiveKitRoomService, mint_access_token


def test_mint_access_token_builds_a_valid_room_join_jwt() -> None:
    secret = "test-secret"
    token = mint_access_token("APIkey123", secret, "call-1", "agent-1", name="Agent", metadata="a1")
    claims = jwt.decode(token, secret, algorithms=["HS256"])

    assert claims["iss"] == "APIkey123"
    assert claims["sub"] == "agent-1"
    assert claims["name"] == "Agent"
    assert claims["metadata"] == "a1"
    assert claims["video"]["room"] == "call-1"
    assert claims["video"]["roomJoin"] is True
    assert claims["exp"] > claims["nbf"]


def test_token_is_signed_with_the_secret() -> None:
    token = mint_access_token("k", "right-secret", "r", "i")
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, "wrong-secret", algorithms=["HS256"])


def test_room_service_normalises_ws_url_to_http() -> None:
    svc = LiveKitRoomService("wss://x.livekit.cloud", "k", "s")
    assert svc._http_url == "https://x.livekit.cloud"


_LK = os.environ.get("LIVEKIT_URL") and os.environ.get("LIVEKIT_API_KEY") and os.environ.get(
    "LIVEKIT_API_SECRET"
)


@pytest.mark.skipif(not _LK, reason="no LiveKit keys")
async def test_room_service_create_and_delete_live() -> None:
    svc = LiveKitRoomService(
        os.environ["LIVEKIT_URL"], os.environ["LIVEKIT_API_KEY"], os.environ["LIVEKIT_API_SECRET"]
    )
    name = f"pytest-{os.getpid()}"
    created = await svc.create_room(name)
    assert created == name
    await svc.delete_room(name)
    # Deleting again is idempotent (TwirpError swallowed).
    await svc.delete_room(name)
