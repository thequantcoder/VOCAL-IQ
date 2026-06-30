import asyncio

import jwt
import pytest

from app.calls.livekit_service import create_room, mint_access_token


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


def test_create_room_is_deferred() -> None:
    with pytest.raises(NotImplementedError):
        asyncio.run(create_room("call-1"))
