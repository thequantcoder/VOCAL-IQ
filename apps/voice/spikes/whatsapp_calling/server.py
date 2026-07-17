"""WAC-00 spike — throwaway webhook receiver + signaling driver for ONE inbound WhatsApp call.

⚠️ NOT product code. Reuses the *shape* of the production Meta webhook seam (HMAC-verified, verify-
token handshake) but stands alone so it can run behind a tunnel against a test number. On a Connect
webhook it answers with the {@link media.answer_offer} tone peer, drives `pre_accept` → `accept`, then
`terminate`, logging the real payloads/timings for the findings runbook.

Run:  uvicorn spikes.whatsapp_calling.server:app --port 8090   (then point a tunnel at it, and set the
WABA webhook to <tunnel>/webhook). Requires WAC-00 test creds in the environment.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time

import httpx
from fastapi import FastAPI, Request, Response

from spikes.whatsapp_calling.media import answer_offer

APP_SECRET = os.environ.get("META_APP_SECRET", "")
VERIFY_TOKEN = os.environ.get("META_WEBHOOK_VERIFY_TOKEN", "")
ACCESS_TOKEN = os.environ.get("WHATSAPP_TEST_ACCESS_TOKEN", "")
PHONE_NUMBER_ID = os.environ.get("WHATSAPP_TEST_PHONE_NUMBER_ID", "")
GRAPH_VERSION = os.environ.get("WHATSAPP_GRAPH_VERSION", "v21.0")
GRAPH = f"https://graph.facebook.com/{GRAPH_VERSION}"

app = FastAPI(title="WAC-00 spike")
_peers: dict[str, object] = {}  # keep RTCPeerConnections alive until terminate


def _verify(raw: bytes, header: str | None) -> bool:
    """Meta signs the RAW body with the app secret (SHA-256). NEVER skip this, even in a spike."""
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


async def _call_action(client: httpx.AsyncClient, call_id: str, body: dict[str, object]) -> httpx.Response:
    """POST /<PNID>/calls with an action (pre_accept / accept / terminate)."""
    return await client.post(
        f"{GRAPH}/{PHONE_NUMBER_ID}/calls",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
        json={"messaging_product": "whatsapp", "call_id": call_id, **body},
    )


@app.get("/webhook")
def verify(request: Request) -> Response:
    """Meta's subscription handshake: echo hub.challenge when the verify token matches."""
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == VERIFY_TOKEN:
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    return Response(status_code=403)


@app.post("/webhook")
async def webhook(request: Request) -> Response:
    raw = await request.body()
    if not _verify(raw, request.headers.get("x-hub-signature-256")):
        return Response(status_code=401)

    payload = json.loads(raw)
    print("[spike] webhook:", json.dumps(payload, indent=2))  # noqa: T201 — spike logging is the deliverable

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            for call in change.get("value", {}).get("calls", []):
                await _handle_call(call)
    return Response(status_code=200)


async def _handle_call(call: dict[str, object]) -> None:
    """Answer a Connect (offer) → pre_accept + accept; log a Terminate's duration."""
    call_id = str(call.get("id", ""))
    event = call.get("event")
    session = call.get("session") or {}

    if event == "connect" and isinstance(session, dict) and session.get("sdp_type") == "offer":
        t0 = time.monotonic()
        pc, answer_sdp = await answer_offer(str(session["sdp"]), record_to=f"caller-{call_id}.wav")
        _peers[call_id] = pc
        async with httpx.AsyncClient(timeout=15) as client:
            # Media only after accept 200; pre_accept warms the path to cut first-word clipping.
            pre = await _call_action(client, call_id, {"action": "pre_accept",
                "session": {"sdp_type": "answer", "sdp": answer_sdp}})
            acc = await _call_action(client, call_id, {"action": "accept",
                "session": {"sdp_type": "answer", "sdp": answer_sdp}})
        print(f"[spike] pre_accept={pre.status_code} accept={acc.status_code} "  # noqa: T201
              f"answer_in={time.monotonic() - t0:.2f}s")
    elif event == "terminate":
        print(f"[spike] terminate call={call_id} duration={call.get('duration')} "  # noqa: T201
              f"status={call.get('status')}")
        pc = _peers.pop(call_id, None)  # type: ignore[assignment]
        if pc is not None:
            await pc.close()  # type: ignore[attr-defined]
