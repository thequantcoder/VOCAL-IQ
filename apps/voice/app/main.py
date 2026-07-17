"""VocalIQ voice service — FastAPI control surface for the real-time call loop.

Day 08 adds the call control plane (`/calls/start`, lifecycle, LiveKit token minting).
The live media bridge (Pipecat agent join + greeting) lands on Day 09 with the keys.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.calls.router import (
    active_session_count,
    drain_active_calls,
    router as calls_router,
)
from app.calls.whatsapp_router import router as whatsapp_router
from app.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Graceful startup/shutdown — on stop, in-flight sessions are ended via legal
    terminal transitions and their LiveKit rooms deleted so none are orphaned."""
    yield
    await drain_active_calls()


app = FastAPI(title="VocalIQ Voice Service", version="0.0.0", lifespan=lifespan)
app.include_router(calls_router)
app.include_router(whatsapp_router)


@app.get("/healthz")
def healthz() -> dict[str, object]:
    """Liveness probe used by local dev, CI, and orchestrators."""
    return {
        "status": "ok",
        "service": "voice",
        "env": settings.env,
        "livekit": settings.livekit_configured,
        "active_calls": active_session_count(),
    }
