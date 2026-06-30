"""LiveKit media helpers.

`mint_access_token` is REAL and pure — it builds the LiveKit JWT (HS256 over the API
secret) with a room-join video grant, exactly as the LiveKit server validates it. No
network, so it is fully testable with any key/secret.

`LiveKitRoomService` performs live room provisioning over LiveKit's Twirp API. It pins
certifi's CA bundle because venv/macOS Pythons frequently lack a system trust store
(which otherwise fails the TLS handshake), and normalises the public ws(s):// URL to
http(s):// for the API host. Verified live against the project's LiveKit Cloud instance.
"""

from __future__ import annotations

import ssl
import time

import aiohttp
import certifi
import jwt
from livekit import api


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


class LiveKitRoomService:
    """Create/delete LiveKit rooms. Each op uses a short-lived aiohttp session with a
    certifi CA context (the LiveKit SDK has no built-in CA override)."""

    def __init__(self, url: str, api_key: str, api_secret: str) -> None:
        self._http_url = url.replace("wss://", "https://").replace("ws://", "http://")
        self._api_key = api_key
        self._api_secret = api_secret
        self._ssl = ssl.create_default_context(cafile=certifi.where())

    def _client(self) -> tuple[api.LiveKitAPI, aiohttp.ClientSession]:
        session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=self._ssl))
        lk = api.LiveKitAPI(self._http_url, self._api_key, self._api_secret, session=session)
        return lk, session

    async def create_room(self, name: str) -> str:
        """Provision the WebRTC room the caller + Pipecat agent join. Returns its name."""
        lk, session = self._client()
        try:
            room = await lk.room.create_room(api.CreateRoomRequest(name=name))
            return room.name
        finally:
            await lk.aclose()
            await session.close()

    async def delete_room(self, name: str) -> None:
        """Tear a room down (idempotent — a missing room is not an error)."""
        lk, session = self._client()
        try:
            await lk.room.delete_room(api.DeleteRoomRequest(room=name))
        except api.TwirpError:
            # Already gone / never created — nothing to clean up.
            pass
        finally:
            await lk.aclose()
            await session.close()
