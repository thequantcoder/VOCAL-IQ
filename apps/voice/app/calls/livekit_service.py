"""LiveKit media helpers.

`mint_access_token` is REAL and pure — it builds the LiveKit JWT (HS256 over the API
secret) with a room-join video grant, exactly as the LiveKit server validates it. No
network, so it is fully testable with any key/secret.

`create_room` is DEFERRED: it requires a live LiveKit server (RoomServiceClient). It
lands with the LiveKit keys (Day 09); for now it raises a clear error.
"""

from __future__ import annotations

import time

import jwt


def mint_access_token(
    api_key: str,
    api_secret: str,
    room: str,
    identity: str,
    *,
    ttl_seconds: int = 3600,
    name: str | None = None,
    can_publish: bool = True,
    can_subscribe: bool = True,
    metadata: str | None = None,
) -> str:
    """Build a LiveKit access token (JWT) granting `identity` join access to `room`."""
    now = int(time.time())
    claims: dict[str, object] = {
        "iss": api_key,
        "sub": identity,
        "nbf": now,
        "exp": now + ttl_seconds,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
        },
    }
    if name is not None:
        claims["name"] = name
    if metadata is not None:
        claims["metadata"] = metadata
    return jwt.encode(claims, api_secret, algorithm="HS256")


async def create_room(name: str) -> dict[str, str]:
    """DEFERRED (pending LiveKit keys): create a room via RoomServiceClient.

    TODO(Day 09 live): livekit.api.LiveKitAPI(url, key, secret).room.create_room(...).
    """
    raise NotImplementedError(
        f"LiveKit room creation not yet implemented (pending live keys): room={name}"
    )
