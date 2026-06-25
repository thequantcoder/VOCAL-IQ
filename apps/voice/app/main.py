"""VocalIQ voice service — FastAPI control surface for the real-time call loop.

Day 0 ships only the health endpoint. The Pipecat/LiveKit pipeline, the provider
mirror, and per-call tenant scoping land on Days 7–9.
"""

from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="VocalIQ Voice Service", version="0.0.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness probe used by local dev, CI, and orchestrators."""
    return {"status": "ok", "service": "voice", "env": settings.env}
