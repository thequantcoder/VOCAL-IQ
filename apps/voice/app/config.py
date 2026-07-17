"""Voice-service settings, validated at boot (Pydantic v2). Fail-fast, no secrets in code.

The env file is the monorepo-root .env (one source of truth), resolved relative to
this service so `uvicorn` picks up the same keys the rest of the stack uses.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ROOT_ENV), extra="ignore")

    env: str = "development"
    voice_port: int = 8000

    # Datastores (per-call tenant scoping wired Day 9) — optional so the service boots.
    database_url: str | None = None
    redis_url: str | None = None

    # LiveKit media — optional so the service boots; room ops require all three.
    livekit_url: str | None = None
    livekit_api_key: str | None = None
    livekit_api_secret: str | None = None

    # Voice-AI providers — optional so the service boots; the agent loop needs all three.
    deepgram_api_key: str | None = None
    openai_api_key: str | None = None
    elevenlabs_api_key: str | None = None

    # Shared secret for the internal api→voice control hop (WhatsApp media, WAC-03). When unset the
    # internal endpoints are DISABLED (gated) rather than open. Never public.
    voice_internal_secret: str | None = None

    @property
    def livekit_configured(self) -> bool:
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)

    @property
    def voice_ai_configured(self) -> bool:
        """True when the STT+LLM+TTS keys for a live agent are all present."""
        return bool(self.deepgram_api_key and self.openai_api_key and self.elevenlabs_api_key)


settings = Settings()
